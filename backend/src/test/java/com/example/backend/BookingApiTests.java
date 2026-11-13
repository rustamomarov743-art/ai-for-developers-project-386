package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class BookingApiTests {

  @LocalServerPort private int port;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private MutableClock clock;

  private final HttpClient httpClient = HttpClient.newHttpClient();

  @Test
  void createsScheduledMeetingWithTrimmedGuestAndServerCalculatedEnd() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability(
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"11:00\"}],"
            + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");

    var response =
        postBooking(
            "{\"meetingTypeId\":\""
                + meetingType.get("id").asText()
                + "\",\"startsAt\":\"2026-11-16T09:00:00Z\","
                + "\"guestName\":\"  Иван Петров  \",\"guestEmail\":\"  ivan@example.com  \"}");

    assertThat(response.statusCode()).isEqualTo(201);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("id").asText()).isNotBlank();
    assertThat(body.get("meetingTypeId").asText()).isEqualTo(meetingType.get("id").asText());
    assertThat(body.get("startsAt").asText()).isEqualTo("2026-11-16T09:00:00Z");
    assertThat(body.get("endsAt").asText()).isEqualTo("2026-11-16T09:45:00Z");
    assertThat(body.get("guestName").asText()).isEqualTo("Иван Петров");
    assertThat(body.get("guestEmail").asText()).isEqualTo("ivan@example.com");
    assertThat(body.get("createdAt").asText()).isEqualTo("2026-11-13T09:00:00Z");
    assertThat(body.get("status").asText()).isEqualTo("SCHEDULED");
    assertThat(body.get("meetingType")).isEqualTo(meetingType);
  }

  @Test
  void blocksOverlapsAcrossTypesButAllowsAdjacentMeetingsAndHidesGuestData() throws Exception {
    var firstType = createMeetingType("Первая встреча", 45);
    var secondType = createMeetingType("Вторая встреча", 30);
    putAvailability(
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"12:00\"}],"
            + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");
    var firstBooking =
        postBooking(bookingRequest(firstType, "2026-11-16T09:00:00Z", "Первый гость"));
    assertThat(firstBooking.statusCode()).isEqualTo(201);

    var repeated = postBooking(bookingRequest(firstType, "2026-11-16T09:00:00Z", "Повтор"));
    var overlapping =
        postBooking(bookingRequest(secondType, "2026-11-16T09:30:00Z", "Пересечение"));
    var adjacent = postBooking(bookingRequest(secondType, "2026-11-16T09:45:00Z", "Смежная"));

    assertThat(repeated.statusCode()).isEqualTo(409);
    assertThat(objectMapper.readTree(repeated.body()).get("code").asText())
        .isEqualTo("SLOT_UNAVAILABLE");
    assertThat(objectMapper.readTree(repeated.body()).has("errors")).isFalse();
    assertThat(overlapping.statusCode()).isEqualTo(409);
    assertThat(objectMapper.readTree(overlapping.body()).get("code").asText())
        .isEqualTo("SLOT_UNAVAILABLE");
    assertThat(adjacent.statusCode()).isEqualTo(201);

    var availability =
        send(
            "/api/booking/meeting-types/"
                + firstType.get("id").asText()
                + "/availability?timeZone=UTC",
            "GET",
            null);
    var monday = objectMapper.readTree(availability.body()).get("days").get(3);
    assertThat(monday.get("slots").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-16T10:15:00Z");
    assertThat(monday.get("busyIntervals")).hasSize(2);
    for (var interval : monday.get("busyIntervals")) {
      assertThat(interval.has("guestName")).isFalse();
      assertThat(interval.has("guestEmail")).isFalse();
      assertThat(interval.has("meetingType")).isFalse();
      assertThat(interval.has("meetingTypeId")).isFalse();
    }
  }

  @Test
  void rechecksTypeScheduleExceptionsGuestWindowAndLeadTime() throws Exception {
    var firstType = createMeetingType("Проверка слота", 60);
    var secondType = createMeetingType("Пограничный слот", 60);
    putAvailability(
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],"
            + "\"TUESDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],\"WEDNESDAY\":[],"
            + "\"THURSDAY\":[],\"FRIDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}",
        "[{\"date\":\"2026-11-16\",\"type\":\"CLOSED\",\"intervals\":[]}]",
        null);

    var unknownType =
        postBooking(
            bookingRequest(firstType, "2026-11-17T09:00:00Z", "Гость")
                .replace(firstType.get("id").asText(), "unknown"));
    var closedDay = postBooking(bookingRequest(firstType, "2026-11-16T09:00:00Z", "Гость"));
    var outsideWindow = postBooking(bookingRequest(firstType, "2026-12-01T09:00:00Z", "Гость"));
    clock.setInstant(Instant.parse("2026-11-13T08:45:00Z"));
    var atThreshold = postBooking(bookingRequest(firstType, "2026-11-13T09:00:00Z", "Гость"));
    clock.setInstant(Instant.parse("2026-11-13T08:45:01Z"));
    var afterThreshold = postBooking(bookingRequest(secondType, "2026-11-13T09:00:00Z", "Гость"));

    assertThat(unknownType.statusCode()).isEqualTo(409);
    assertThat(objectMapper.readTree(unknownType.body()).get("code").asText())
        .isEqualTo("SLOT_UNAVAILABLE");
    assertThat(closedDay.statusCode()).isEqualTo(409);
    assertThat(outsideWindow.statusCode()).isEqualTo(409);
    assertThat(atThreshold.statusCode()).isEqualTo(201);
    assertThat(afterThreshold.statusCode()).isEqualTo(409);
    assertThat(objectMapper.readTree(afterThreshold.body()).get("code").asText())
        .isEqualTo("SLOT_UNAVAILABLE");
  }

  @Test
  void allowsOnlyOneConcurrentOverlapAndCreatesConcurrentAdjacentMeetings() throws Exception {
    var meetingType = createMeetingType("Конкурентная встреча", 45);
    putAvailability(
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"12:00\"}],"
            + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");
    var start = new CompletableFuture<Void>();
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var first =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return postBookingUnchecked(
                    bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Первый"));
              },
              executor);
      var second =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return postBookingUnchecked(
                    bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Второй"));
              },
              executor);
      start.complete(null);
      var responses = List.of(first.join(), second.join());
      assertThat(responses)
          .extracting(HttpResponse::statusCode)
          .containsExactlyInAnyOrder(201, 409);
      assertThat(
              responses.stream()
                  .filter(response -> response.statusCode() == 409)
                  .map(response -> readCode(response)))
          .containsExactly("SLOT_UNAVAILABLE");

      var adjacentStart = new CompletableFuture<Void>();
      var third =
          CompletableFuture.supplyAsync(
              () -> {
                adjacentStart.join();
                return postBookingUnchecked(
                    bookingRequest(meetingType, "2026-11-16T09:45:00Z", "Третий"));
              },
              executor);
      var fourth =
          CompletableFuture.supplyAsync(
              () -> {
                adjacentStart.join();
                return postBookingUnchecked(
                    bookingRequest(meetingType, "2026-11-16T10:30:00Z", "Четвёртый"));
              },
              executor);
      adjacentStart.complete(null);
      assertThat(List.of(third.join(), fourth.join()))
          .extracting(HttpResponse::statusCode)
          .containsExactly(201, 201);
    }

    var monday = bookingDay(meetingType, 3);
    assertThat(monday.get("busyIntervals")).hasSize(3);
  }

  @Test
  void keepsExistingMeetingBusyAfterAvailabilityReplacement() throws Exception {
    var meetingType = createMeetingType("Сохранённая встреча", 45);
    var availableMonday = "{\"start\":\"09:00\",\"end\":\"10:00\"}";
    putAvailability(
        "{\"MONDAY\":["
            + availableMonday
            + "],\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");
    assertThat(
            postBooking(bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Гость")).statusCode())
        .isEqualTo(201);

    putAvailability(
        "{\"MONDAY\":[],\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],"
            + "\"FRIDAY\":[],\"SATURDAY\":[],\"SUNDAY\":[]}",
        "[]",
        1);

    var monday = bookingDay(meetingType, 3);
    assertThat(monday.get("slots")).isEmpty();
    assertThat(monday.get("busyIntervals")).hasSize(1);
    assertThat(monday.get("busyIntervals").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-16T09:00:00Z");
    assertThat(
            postBooking(bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Повтор")).statusCode())
        .isEqualTo(409);
  }

  @Test
  void bookingAndAvailabilityReplacementAreAtomic() throws Exception {
    var meetingType = createMeetingType("Атомарная замена", 45);
    var start = new CompletableFuture<Void>();
    var bookingRequest = bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Гость");
    var closedAvailability =
        "{\"timeZone\":\"UTC\",\"expectedVersion\":1,"
            + "\"weeklyTemplate\":{\"MONDAY\":[],\"TUESDAY\":[],\"WEDNESDAY\":[],"
            + "\"THURSDAY\":[],\"FRIDAY\":[],\"SATURDAY\":[],\"SUNDAY\":[]},\"exceptions\":[]}";
    putAvailability(
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],"
            + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");

    HttpResponse<String> booking;
    HttpResponse<String> replacement;
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var bookingFuture =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return postBookingUnchecked(bookingRequest);
              },
              executor);
      var replacementFuture =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return sendUnchecked("/api/owner/availability", "PUT", closedAvailability);
              },
              executor);
      start.complete(null);
      booking = bookingFuture.join();
      replacement = replacementFuture.join();
    }

    assertThat(replacement.statusCode()).isEqualTo(200);
    assertThat(booking.statusCode()).isIn(201, 409);
    assertThat(postBooking(bookingRequest).statusCode()).isEqualTo(409);
    var monday = bookingDay(meetingType, 3);
    assertThat(monday.get("slots")).isEmpty();
    assertThat(monday.get("busyIntervals")).hasSize(booking.statusCode() == 201 ? 1 : 0);
  }

  private JsonNode bookingDay(JsonNode meetingType, int dayIndex) throws Exception {
    var response =
        send(
            "/api/booking/meeting-types/"
                + meetingType.get("id").asText()
                + "/availability?timeZone=UTC",
            "GET",
            null);
    assertThat(response.statusCode()).isEqualTo(200);
    return objectMapper.readTree(response.body()).get("days").get(dayIndex);
  }

  private String readCode(HttpResponse<String> response) {
    try {
      return objectMapper.readTree(response.body()).get("code").asText();
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  private HttpResponse<String> postBookingUnchecked(String body) {
    return sendUnchecked("/api/booking/bookings", "POST", body);
  }

  private HttpResponse<String> sendUnchecked(String path, String method, String body) {
    try {
      return send(path, method, body);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  @ParameterizedTest
  @MethodSource("invalidBookingRequests")
  void rejectsInvalidBookingFieldsWithProblemDetails(String requestBody, String expectedPath)
      throws Exception {
    var response = postBooking(requestBody);

    assertThat(response.statusCode()).isEqualTo(400);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("type").asText()).isEqualTo("about:blank");
    assertThat(body.get("title").asText()).isEqualTo("Bad Request");
    assertThat(body.get("status").asInt()).isEqualTo(400);
    assertThat(body.get("detail").asText()).isNotBlank();
    assertThat(body.get("instance").asText()).isEqualTo("/api/booking/bookings");
    assertThat(body.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    var paths = new ArrayList<String>();
    body.get("errors").forEach(error -> paths.add(error.get("path").asText()));
    assertThat(paths).contains(expectedPath);
  }

  static Stream<Arguments> invalidBookingRequests() {
    return Stream.of(
        Arguments.of(
            "{\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@example.com\"}",
            "meetingTypeId"),
        Arguments.of(
            "{\"meetingTypeId\":\" \",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@example.com\"}",
            "meetingTypeId"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"не дата\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@example.com\"}",
            "startsAt"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\" \",\"guestEmail\":\"ivan@example.com\"}",
            "guestName"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\""
                + "а".repeat(101)
                + "\",\"guestEmail\":\"ivan@example.com\"}",
            "guestName"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\" \"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\""
                + "a".repeat(253)
                + "@x\"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan.example.com\"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@@example.com\"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"@example.com\"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@\"}",
            "guestEmail"),
        Arguments.of(
            "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan petrov@example.com\"}",
            "guestEmail"));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{\"meetingTypeId\":",
        "{\"meetingTypeId\":42,\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":\"ivan@example.com\"}",
        "{\"meetingTypeId\":\"type\",\"startsAt\":42,\"guestName\":\"Иван\",\"guestEmail\":\"ivan@example.com\"}",
        "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":42,\"guestEmail\":\"ivan@example.com\"}",
        "{\"meetingTypeId\":\"type\",\"startsAt\":\"2026-11-16T09:00:00Z\",\"guestName\":\"Иван\",\"guestEmail\":42}"
      })
  void rejectsMalformedBookingWithProblemDetails(String requestBody) throws Exception {
    var response = postBooking(requestBody);

    assertThat(response.statusCode()).isEqualTo(400);
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("code").asText()).isEqualTo("MALFORMED_REQUEST");
    assertThat(body.has("errors")).isFalse();
  }

  private String bookingRequest(JsonNode meetingType, String startsAt, String guestName) {
    return "{\"meetingTypeId\":\""
        + meetingType.get("id").asText()
        + "\",\"startsAt\":\""
        + startsAt
        + "\",\"guestName\":\""
        + guestName
        + "\",\"guestEmail\":\"guest@example.com\"}";
  }

  private JsonNode createMeetingType(String name, int durationMinutes) throws Exception {
    var response =
        send(
            "/api/owner/meeting-types",
            "POST",
            "{\"name\":\""
                + name
                + "\",\"description\":\"Описание\",\"durationMinutes\":"
                + durationMinutes
                + "}");
    assertThat(response.statusCode()).isEqualTo(201);
    return objectMapper.readTree(response.body());
  }

  private void putAvailability(String weeklyTemplate) throws Exception {
    putAvailability(weeklyTemplate, "[]", null);
  }

  private void putAvailability(String weeklyTemplate, String exceptions, Integer expectedVersion)
      throws Exception {
    var version = expectedVersion == null ? "null" : expectedVersion.toString();
    var response =
        send(
            "/api/owner/availability",
            "PUT",
            "{\"timeZone\":\"UTC\",\"expectedVersion\":"
                + version
                + ",\"weeklyTemplate\":"
                + weeklyTemplate
                + ",\"exceptions\":"
                + exceptions
                + "}");
    assertThat(response.statusCode()).isEqualTo(200);
  }

  private HttpResponse<String> postBooking(String body) throws Exception {
    return send("/api/booking/bookings", "POST", body);
  }

  private HttpResponse<String> send(String path, String method, String body) throws Exception {
    return httpClient.send(
        HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .method(
                method,
                body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(body))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class FixedClockConfiguration {
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
}
