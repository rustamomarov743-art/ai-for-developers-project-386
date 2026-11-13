package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class AvailabilityApiTests {

  @LocalServerPort private int port;

  @Autowired private ObjectMapper objectMapper;
  @Autowired private MutableClock clock;

  private final HttpClient httpClient = HttpClient.newHttpClient();

  @Test
  void returnsNoAvailabilityBeforeFirstSave() throws Exception {
    var response = getAvailability();

    assertThat(response.statusCode()).isEqualTo(200);
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("exists").asBoolean()).isFalse();
    assertThat(body.has("timeZone")).isFalse();
    assertThat(body.has("version")).isFalse();
    assertThat(body.has("weeklyTemplate")).isFalse();
  }

  @Test
  void createsAndLoadsEmptyWeeklyTemplate() throws Exception {
    var response =
        putAvailability(
            "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
                + emptyWeeklyTemplate()
                + "}");

    assertThat(response.statusCode()).isEqualTo(200);
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("exists").asBoolean()).isTrue();
    assertThat(body.get("timeZone").asText()).isEqualTo("Europe/Moscow");
    assertThat(body.get("version").asInt()).isEqualTo(1);
    assertThat(body.get("weeklyTemplate").get("MONDAY").isArray()).isTrue();
    assertThat(body.get("weeklyTemplate").get("SUNDAY").isArray()).isTrue();

    var loaded = objectMapper.readTree(getAvailability().body());
    assertThat(loaded).isEqualTo(body);
  }

  @TestConfiguration
  static class MutableClockConfiguration {
    @Bean
    @Primary
    MutableClock mutableClock() {
      return new MutableClock(Instant.parse("2026-11-13T09:00:00Z"), ZoneOffset.UTC);
    }
  }

  static class MutableClock extends Clock {
    private Instant instant;
    private final ZoneOffset zone;

    MutableClock(Instant instant, ZoneOffset zone) {
      this.instant = instant;
      this.zone = zone;
    }

    void setInstant(Instant instant) {
      this.instant = instant;
    }

    @Override
    public ZoneOffset getZone() {
      return zone;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return Clock.fixed(instant, zone);
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }

  @Test
  void savesClosedAndCustomExceptionsInDateOrder() throws Exception {
    var response =
        putAvailability(
            "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
                + emptyWeeklyTemplate()
                + ",\"exceptions\":["
                + "{\"date\":\"2099-12-02\",\"type\":\"CUSTOM\",\"intervals\":["
                + "{\"start\":\"12:17\",\"end\":\"13:19\"},"
                + "{\"start\":\"11:03\",\"end\":\"12:17\"}]},"
                + "{\"date\":\"2099-12-01\",\"type\":\"CLOSED\",\"intervals\":[]}]}");

    assertThat(response.statusCode()).isEqualTo(200);
    var body = objectMapper.readTree(response.body());
    var exceptions = body.get("exceptions");
    assertThat(exceptions).hasSize(2);
    assertThat(exceptions.get(0).get("date").asText()).isEqualTo("2099-12-01");
    assertThat(exceptions.get(0).get("type").asText()).isEqualTo("CLOSED");
    assertThat(exceptions.get(0).get("intervals")).isEmpty();
    assertThat(exceptions.get(1).get("date").asText()).isEqualTo("2099-12-02");
    assertThat(exceptions.get(1).get("type").asText()).isEqualTo("CUSTOM");
    assertThat(exceptions.get(1).get("intervals")).hasSize(2);
    assertThat(exceptions.get(1).get("intervals").get(0).get("start").asText()).isEqualTo("11:03");
    assertThat(exceptions.get(1).get("intervals").get(1).get("start").asText()).isEqualTo("12:17");
    assertThat(objectMapper.readTree(getAvailability().body())).isEqualTo(body);
  }

  @Test
  void sortsIntervalsByStartAndKeepsAdjacentIntervalsSeparate() throws Exception {
    var template =
        emptyWeeklyTemplate()
            .replace(
                "\"MONDAY\":[]",
                "\"MONDAY\":[{\"start\":\"10:17\",\"end\":\"11:19\"},"
                    + "{\"start\":\"09:03\",\"end\":\"10:17\"}]");

    var response =
        putAvailability(
            "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
                + template
                + "}");

    assertThat(response.statusCode()).isEqualTo(200);
    var intervals = objectMapper.readTree(response.body()).get("weeklyTemplate").get("MONDAY");
    assertThat(intervals).hasSize(2);
    assertThat(intervals.get(0).get("start").asText()).isEqualTo("09:03");
    assertThat(intervals.get(0).get("end").asText()).isEqualTo("10:17");
    assertThat(intervals.get(1).get("start").asText()).isEqualTo("10:17");
    assertThat(intervals.get(1).get("end").asText()).isEqualTo("11:19");
  }

  @Test
  void incrementsVersionAndRejectsStaleReplacementWithoutChangingState() throws Exception {
    var created =
        putAvailability(
            "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
                + emptyWeeklyTemplate()
                + "}");
    assertThat(created.statusCode()).isEqualTo(200);
    var template =
        emptyWeeklyTemplate()
            .replace("\"FRIDAY\":[]", "\"FRIDAY\":[{\"start\":\"12:01\",\"end\":\"13:02\"}]");
    var request =
        "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":1,\"weeklyTemplate\":"
            + template
            + "}";

    var updated = putAvailability(request);
    var stale = putAvailability(request);

    assertThat(updated.statusCode()).isEqualTo(200);
    assertThat(objectMapper.readTree(updated.body()).get("version").asInt()).isEqualTo(2);
    assertThat(stale.statusCode()).isEqualTo(409);
    var problem = objectMapper.readTree(stale.body());
    assertThat(problem.get("code").asText()).isEqualTo("AVAILABILITY_VERSION_CONFLICT");
    assertThat(problem.has("errors")).isFalse();
    assertThat(problem.has("weeklyTemplate")).isFalse();
    assertThat(problem.has("version")).isFalse();
    var current = objectMapper.readTree(getAvailability().body());
    assertThat(current.get("version").asInt()).isEqualTo(2);
    assertThat(current.get("weeklyTemplate").get("FRIDAY")).hasSize(1);
  }

  @Test
  void keepsTimeZoneImmutableAfterCreation() throws Exception {
    putAvailability(requestWithMonday("[]"));

    var response =
        putAvailability(
            requestWithMonday("[]").replace("Europe/Moscow", "UTC").replace("null", "1"));

    assertThat(response.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(response.body());
    assertThat(problem.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    assertThat(problem.get("errors").get(0).get("path").asText()).isEqualTo("timeZone");
    var current = objectMapper.readTree(getAvailability().body());
    assertThat(current.get("timeZone").asText()).isEqualTo("Europe/Moscow");
    assertThat(current.get("version").asInt()).isEqualTo(1);
  }

  @Test
  void acceptsExceptionOnTodayInScheduleTimeZone() throws Exception {
    var response =
        putAvailability(
            requestWithExceptions(
                "[{\"date\":\"2026-11-13\",\"type\":\"CLOSED\",\"intervals\":[]}]"));

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(objectMapper.readTree(response.body()).get("exceptions")).hasSize(1);
  }

  @ParameterizedTest
  @MethodSource("invalidExceptionRequests")
  void rejectsInvalidExceptionsWithoutCreatingAvailability(String request, String expectedPath)
      throws Exception {
    var response = putAvailability(request);

    assertThat(response.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(response.body());
    assertThat(problem.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    var paths = new java.util.ArrayList<String>();
    problem.get("errors").forEach(error -> paths.add(error.get("path").asText()));
    assertThat(paths).contains(expectedPath);
    assertThat(objectMapper.readTree(getAvailability().body()).get("exists").asBoolean()).isFalse();
  }

  static Stream<Arguments> invalidExceptionRequests() {
    return Stream.of(
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-12\",\"type\":\"CLOSED\",\"intervals\":[]}]"),
            "exceptions[0].date"),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CLOSED\",\"intervals\":[{\"start\":\"09:00\",\"end\":\"10:00\"}]}]"),
            "exceptions[0].intervals"),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CUSTOM\",\"intervals\":[]}]"),
            "exceptions[0].intervals"),
        Arguments.of(
            requestWithExceptions("[{\"date\":\"2026-11-14\",\"type\":\"CLOSED\"}]"),
            "exceptions[0].intervals"),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"09:00\",\"end\":\"10:00\"},{\"start\":\"09:30\",\"end\":\"11:00\"}]}]"),
            "exceptions[0].intervals"),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"9:00\",\"end\":\"10:00\"}]}]"),
            "exceptions[0].intervals[0].start"),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"09:00\",\"end\":\"09:00\"}]}]"),
            "exceptions[0].intervals[0].end"));
  }

  @Test
  void hidesPastExceptionsAndDeletesThemOnlyAfterSuccessfulReplacement() throws Exception {
    var created =
        putAvailability(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CLOSED\",\"intervals\":[]}]"));
    assertThat(created.statusCode()).isEqualTo(200);

    clock.setInstant(Instant.parse("2026-11-15T09:00:00Z"));
    assertThat(objectMapper.readTree(getAvailability().body()).get("exceptions")).isEmpty();

    var stale =
        putAvailability(
            requestWithExceptions("[]").replace("expectedVersion\":null", "expectedVersion\":0"));
    assertThat(stale.statusCode()).isEqualTo(409);
    var invalid =
        putAvailability(
            requestWithExceptions("[]")
                .replace("expectedVersion\":null", "expectedVersion\":1")
                .replace("\"MONDAY\":[]", "\"MONDAY\":[{\"start\":\"10:00\",\"end\":\"09:00\"}]"));
    assertThat(invalid.statusCode()).isEqualTo(400);

    clock.setInstant(Instant.parse("2026-11-13T09:00:00Z"));
    var afterFailures = objectMapper.readTree(getAvailability().body());
    assertThat(afterFailures.get("exceptions")).hasSize(1);
    assertThat(afterFailures.get("version").asInt()).isEqualTo(1);

    clock.setInstant(Instant.parse("2026-11-15T09:00:00Z"));
    var replaced =
        putAvailability(
            requestWithExceptions("[]").replace("expectedVersion\":null", "expectedVersion\":1"));
    assertThat(replaced.statusCode()).isEqualTo(200);

    clock.setInstant(Instant.parse("2026-11-13T09:00:00Z"));
    var afterSuccess = objectMapper.readTree(getAvailability().body());
    assertThat(afterSuccess.get("exceptions")).isEmpty();
    assertThat(afterSuccess.get("version").asInt()).isEqualTo(2);
  }

  @Test
  void appliesWeeklyTemplateAndExceptionsAsOneState() throws Exception {
    putAvailability(
        requestWithExceptions("[{\"date\":\"2026-11-14\",\"type\":\"CLOSED\",\"intervals\":[]}]"));
    var changedTemplate = "\"MONDAY\":[{\"start\":\"09:01\",\"end\":\"10:02\"}]";
    var invalid =
        putAvailability(
            requestWithExceptions(
                    "[{\"date\":\"2026-11-15\",\"type\":\"CUSTOM\",\"intervals\":[]}]")
                .replace("expectedVersion\":null", "expectedVersion\":1")
                .replace("\"MONDAY\":[]", changedTemplate));
    var stale =
        putAvailability(
            requestWithExceptions(
                    "[{\"date\":\"2026-11-15\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"11:03\",\"end\":\"12:04\"}]}]")
                .replace("expectedVersion\":null", "expectedVersion\":0")
                .replace("\"MONDAY\":[]", changedTemplate));

    assertThat(invalid.statusCode()).isEqualTo(400);
    assertThat(stale.statusCode()).isEqualTo(409);
    var unchanged = objectMapper.readTree(getAvailability().body());
    assertThat(unchanged.get("version").asInt()).isEqualTo(1);
    assertThat(unchanged.get("weeklyTemplate").get("MONDAY")).isEmpty();
    assertThat(unchanged.get("exceptions").get(0).get("type").asText()).isEqualTo("CLOSED");

    var updated =
        putAvailability(
            requestWithExceptions(
                    "[{\"date\":\"2026-11-15\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"11:03\",\"end\":\"12:04\"}]}]")
                .replace("expectedVersion\":null", "expectedVersion\":1")
                .replace("\"MONDAY\":[]", changedTemplate));

    assertThat(updated.statusCode()).isEqualTo(200);
    var current = objectMapper.readTree(updated.body());
    assertThat(current.get("version").asInt()).isEqualTo(2);
    assertThat(current.get("weeklyTemplate").get("MONDAY")).hasSize(1);
    assertThat(current.get("exceptions").get(0).get("type").asText()).isEqualTo("CUSTOM");
    assertThat(objectMapper.readTree(getAvailability().body())).isEqualTo(current);
  }

  @ParameterizedTest
  @MethodSource("malformedExceptionRequests")
  void rejectsMalformedExceptions(String request) throws Exception {
    var response = putAvailability(request);

    assertThat(response.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(response.body());
    assertThat(problem.get("code").asText()).isEqualTo("MALFORMED_REQUEST");
    assertThat(problem.has("errors")).isFalse();
    assertThat(objectMapper.readTree(getAvailability().body()).get("exists").asBoolean()).isFalse();
  }

  static Stream<Arguments> malformedExceptionRequests() {
    return Stream.of(
        Arguments.of(requestWithExceptions("{}")),
        Arguments.of(requestWithExceptions("null")),
        Arguments.of(
            requestWithExceptions("[{\"date\":20261114,\"type\":\"CLOSED\",\"intervals\":[]}]")),
        Arguments.of(
            requestWithExceptions(
                "[{\"date\":\"2026-11-14\",\"type\":\"CLOSED\",\"intervals\":{}}]")));
  }

  @Test
  void rejectsMalformedWeeklyTemplate() throws Exception {
    var response =
        putAvailability(requestWithMonday("[]").replace("\"TUESDAY\":[]", "\"TUESDAY\":\"09:00\""));

    assertThat(response.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(response.body());
    assertThat(problem.get("code").asText()).isEqualTo("MALFORMED_REQUEST");
    assertThat(problem.has("errors")).isFalse();
  }

  @Test
  void allowsOnlyOneOfTwoParallelReplacementsWithSameVersion() throws Exception {
    putAvailability(requestWithMonday("[]"));
    var first = requestWithMonday("[{\"start\":\"09:01\",\"end\":\"10:02\"}]").replace("null", "1");
    var second =
        requestWithMonday("[{\"start\":\"11:03\",\"end\":\"12:04\"}]").replace("null", "1");

    var requests =
        List.of(first, second).stream()
            .map(body ->
                CompletableFuture.supplyAsync(() -> {
                  try {
                    return putAvailability(body);
                  } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                  }
                }))
            .toList();
    CompletableFuture.allOf(requests.toArray(CompletableFuture[]::new)).join();
    var statuses =
        requests.stream().map(CompletableFuture::join).map(HttpResponse::statusCode).toList();

    assertThat(statuses).containsExactlyInAnyOrder(200, 409);
    var current = objectMapper.readTree(getAvailability().body());
    assertThat(current.get("version").asInt()).isEqualTo(2);
    assertThat(current.get("weeklyTemplate").get("MONDAY")).hasSize(1);
  }

  @ParameterizedTest
  @MethodSource("invalidAvailabilityRequests")
  void rejectsInvalidTemplateWithoutCreatingAvailability(String request, String expectedPath)
      throws Exception {
    var response = putAvailability(request);

    assertThat(response.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(response.body());
    assertThat(problem.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    var paths = new java.util.ArrayList<String>();
    problem.get("errors").forEach(error -> paths.add(error.get("path").asText()));
    assertThat(paths).contains(expectedPath);
    assertThat(objectMapper.readTree(getAvailability().body()).get("exists").asBoolean()).isFalse();
  }

  static Stream<Arguments> invalidAvailabilityRequests() {
    return Stream.of(
        Arguments.of(
            requestWithMonday("[{\"start\":\"09:00\",\"end\":\"09:00\"}]"),
            "weeklyTemplate.MONDAY[0].end"),
        Arguments.of(
            requestWithMonday("[{\"start\":\"23:59\",\"end\":\"00:01\"}]"),
            "weeklyTemplate.MONDAY[0].end"),
        Arguments.of(
            requestWithMonday("[{\"start\":\"9:00\",\"end\":\"10:00\"}]"),
            "weeklyTemplate.MONDAY[0].start"),
        Arguments.of(
            requestWithMonday(
                "[{\"start\":\"09:00\",\"end\":\"10:00\"},{\"start\":\"09:30\",\"end\":\"11:00\"}]"),
            "weeklyTemplate.MONDAY"),
        Arguments.of(
            requestWithMonday("[]").replace(",\"SUNDAY\":[]", ""), "weeklyTemplate.SUNDAY"),
        Arguments.of(requestWithMonday("[]").replace("Europe/Moscow", "Mars/Olympus"), "timeZone"));
  }

  private static String requestWithMonday(String intervals) {
    var template = emptyWeeklyTemplate().replace("\"MONDAY\":[]", "\"MONDAY\":" + intervals);
    return "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
        + template
        + "}";
  }

  private static String requestWithExceptions(String exceptions) {
    return "{\"timeZone\":\"Europe/Moscow\",\"expectedVersion\":null,\"weeklyTemplate\":"
        + emptyWeeklyTemplate()
        + ",\"exceptions\":"
        + exceptions
        + "}";
  }

  private HttpResponse<String> getAvailability() throws Exception {
    var request =
        HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/api/owner/availability"))
            .GET()
            .build();
    return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> putAvailability(String body) throws Exception {
    var request =
        HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/api/owner/availability"))
            .header("Content-Type", "application/json")
            .PUT(HttpRequest.BodyPublishers.ofString(body))
            .build();
    return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private static String emptyWeeklyTemplate() {
    return "{\"MONDAY\":[],\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],"
        + "\"FRIDAY\":[],\"SATURDAY\":[],\"SUNDAY\":[]}";
  }
}
