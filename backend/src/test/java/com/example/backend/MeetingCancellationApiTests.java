package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
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
class MeetingCancellationApiTests {

  @LocalServerPort private int port;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private MutableClock clock;

  private final HttpClient httpClient = HttpClient.newHttpClient();

  @Test
  void cancelsFutureMeetingWithoutRequestBodyAndHidesItFromOwner() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    var booking = createBooking(meetingType, "2026-11-16T09:00:00Z", "Гость");

    var response = cancel(booking.get("id").asText());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("id")).isEqualTo(booking.get("id"));
    assertThat(body.get("status").asText()).isEqualTo("CANCELLED");
    assertThat(body.get("startsAt")).isEqualTo(booking.get("startsAt"));
    assertThat(body.get("endsAt")).isEqualTo(booking.get("endsAt"));
    assertThat(body.get("meetingType")).isEqualTo(meetingType);
    assertThat(objectMapper.readTree(getOwnerMeetings().body())).isEmpty();
  }

  @Test
  void rejectsRepeatedCancellationAndMissingMeetingWithProblemDetails() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    var booking = createBooking(meetingType, "2026-11-16T09:00:00Z", "Гость");
    assertThat(cancel(booking.get("id").asText()).statusCode()).isEqualTo(200);

    var repeated = cancel(booking.get("id").asText());
    var missing = cancel("missing");

    assertThat(repeated.statusCode()).isEqualTo(409);
    assertProblem(repeated, "MEETING_ALREADY_CANCELLED", 409);
    assertThat(missing.statusCode()).isEqualTo(404);
    assertProblem(missing, "MEETING_NOT_FOUND", 404);
  }

  @Test
  void rejectsCancellationAtExactStartAndAfterEnd() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    var booking = createBooking(meetingType, "2026-11-16T09:00:00Z", "Гость");

    clock.setInstant(Instant.parse("2026-11-16T09:00:00Z"));
    var atStart = cancel(booking.get("id").asText());
    clock.setInstant(Instant.parse("2026-11-16T09:45:00Z"));
    var atEnd = cancel(booking.get("id").asText());

    assertThat(atStart.statusCode()).isEqualTo(409);
    assertProblem(atStart, "MEETING_ALREADY_STARTED", 409);
    assertThat(atEnd.statusCode()).isEqualTo(409);
    assertProblem(atEnd, "MEETING_ALREADY_STARTED", 409);
  }

  @Test
  void releasesSlotForEveryTypeAndCreatesSeparateReplacementBooking() throws Exception {
    var firstType = createMeetingType("Консультация", 45);
    var secondType = createMeetingType("Короткая встреча", 30);
    putAvailability();
    var original = createBooking(firstType, "2026-11-16T09:00:00Z", "Первый гость");
    assertThat(cancel(original.get("id").asText()).statusCode()).isEqualTo(200);

    var monday = bookingDay(firstType);
    assertThat(monday.get("busyIntervals")).isEmpty();
    assertThat(monday.get("slots").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-16T09:00:00Z");
    assertThat(monday.get("slots").get(0).get("status").asText()).isEqualTo("AVAILABLE");
    var replacement =
        postBooking(bookingRequest(secondType, "2026-11-16T09:30:00Z", "Новый гость"));

    assertThat(replacement.statusCode()).isEqualTo(201);
    var replacementBody = objectMapper.readTree(replacement.body());
    assertThat(replacementBody.get("id").asText()).isNotEqualTo(original.get("id").asText());
    assertThat(replacementBody.get("status").asText()).isEqualTo("SCHEDULED");
    var ownerMeetings = objectMapper.readTree(getOwnerMeetings().body());
    assertThat(ownerMeetings).hasSize(1);
    assertThat(ownerMeetings.get(0).get("id")).isEqualTo(replacementBody.get("id"));
  }

  @Test
  void cancellationAndBookingAreAtomicInEitherProcessingOrder() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    var original = createBooking(meetingType, "2026-11-16T09:00:00Z", "Первый гость");
    var bookingRequest = bookingRequest(meetingType, "2026-11-16T09:00:00Z", "Новый гость");
    var start = new CompletableFuture<Void>();

    HttpResponse<String> cancellation;
    HttpResponse<String> booking;
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var cancellationFuture =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return sendUnchecked(
                    "/api/owner/meetings/" + original.get("id").asText() + "/cancellation",
                    "POST",
                    null);
              },
              executor);
      var bookingFuture =
          CompletableFuture.supplyAsync(
              () -> {
                start.join();
                return sendUnchecked("/api/booking/bookings", "POST", bookingRequest);
              },
              executor);
      start.complete(null);
      cancellation = cancellationFuture.join();
      booking = bookingFuture.join();
    }

    assertThat(cancellation.statusCode()).isEqualTo(200);
    assertThat(booking.statusCode()).isIn(201, 409);
    if (booking.statusCode() == 409) {
      assertProblem(booking, "SLOT_UNAVAILABLE", 409);
      booking = postBooking(bookingRequest);
      assertThat(booking.statusCode()).isEqualTo(201);
    }
    var replacement = objectMapper.readTree(booking.body());
    assertThat(replacement.get("id").asText()).isNotEqualTo(original.get("id").asText());
    var ownerMeetings = objectMapper.readTree(getOwnerMeetings().body());
    assertThat(ownerMeetings).hasSize(1);
    assertThat(ownerMeetings.get(0).get("id")).isEqualTo(replacement.get("id"));
    assertThat(ownerMeetings.get(0).get("startsAt").asText()).isEqualTo("2026-11-16T09:00:00Z");
    assertThat(bookingDay(meetingType).get("busyIntervals")).hasSize(1);
  }

  private HttpResponse<String> sendUnchecked(String path, String method, String body) {
    try {
      return send(path, method, body);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  @Test
  void allowsCancellationInsideBookingLeadTime() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    var booking = createBooking(meetingType, "2026-11-16T09:00:00Z", "Гость");
    clock.setInstant(Instant.parse("2026-11-16T08:59:59Z"));

    var response = cancel(booking.get("id").asText());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(objectMapper.readTree(response.body()).get("status").asText())
        .isEqualTo("CANCELLED");
  }

  private JsonNode bookingDay(JsonNode meetingType) throws Exception {
    var response =
        send(
            "/api/booking/meeting-types/"
                + meetingType.get("id").asText()
                + "/availability?timeZone=UTC",
            "GET",
            null);
    assertThat(response.statusCode()).isEqualTo(200);
    return objectMapper.readTree(response.body()).get("days").get(3);
  }

  private void assertProblem(HttpResponse<String> response, String code, int status)
      throws Exception {
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
    var body = objectMapper.readTree(response.body());
    assertThat(body.get("type").asText()).isEqualTo("about:blank");
    assertThat(body.get("status").asInt()).isEqualTo(status);
    assertThat(body.get("detail").asText()).isNotBlank();
    assertThat(body.get("instance").asText()).isEqualTo(response.uri().getPath());
    assertThat(body.get("code").asText()).isEqualTo(code);
    assertThat(body.has("errors")).isFalse();
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

  private void putAvailability() throws Exception {
    var response =
        send(
            "/api/owner/availability",
            "PUT",
            "{\"timeZone\":\"UTC\",\"expectedVersion\":null,"
                + "\"weeklyTemplate\":{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"12:00\"}],"
                + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
                + "\"SATURDAY\":[],\"SUNDAY\":[]},\"exceptions\":[]}");
    assertThat(response.statusCode()).isEqualTo(200);
  }

  private JsonNode createBooking(JsonNode meetingType, String startsAt, String guestName)
      throws Exception {
    var response = postBooking(bookingRequest(meetingType, startsAt, guestName));
    assertThat(response.statusCode()).isEqualTo(201);
    return objectMapper.readTree(response.body());
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

  private HttpResponse<String> postBooking(String body) throws Exception {
    return send("/api/booking/bookings", "POST", body);
  }

  private HttpResponse<String> cancel(String meetingId) throws Exception {
    return send("/api/owner/meetings/" + meetingId + "/cancellation", "POST", null);
  }

  private HttpResponse<String> getOwnerMeetings() throws Exception {
    return send("/api/owner/meetings", "GET", null);
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
    private final ZoneId zone;

    MutableClock(Instant instant, ZoneId zone) {
      this.instant = instant;
      this.zone = zone;
    }

    void setInstant(Instant instant) {
      this.instant = instant;
    }

    @Override
    public ZoneId getZone() {
      return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return new MutableClock(instant, zone);
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }
}
