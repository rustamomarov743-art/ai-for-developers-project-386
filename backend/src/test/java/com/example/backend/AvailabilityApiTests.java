package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class AvailabilityApiTests {

  @LocalServerPort private int port;

  @Autowired private ObjectMapper objectMapper;

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
