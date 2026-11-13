package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
class BookingSlotApiTests {

  @LocalServerPort private int port;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private MutableClock clock;

  private final HttpClient httpClient = HttpClient.newHttpClient();

  @Test
  void returnsEmptyPublicTypesAndFourteenDaysWithoutAvailability() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);

    var publicTypes = get("/api/booking/meeting-types?timeZone=UTC");
    var availability =
        get(
            "/api/booking/meeting-types/"
                + meetingType.get("id").asText()
                + "/availability?timeZone=UTC");

    assertThat(publicTypes.statusCode()).isEqualTo(200);
    assertThat(objectMapper.readTree(publicTypes.body()).isArray()).isTrue();
    assertThat(objectMapper.readTree(publicTypes.body())).isEmpty();
    assertThat(availability.statusCode()).isEqualTo(200);
    var body = objectMapper.readTree(availability.body());
    assertThat(body.get("days")).hasSize(14);
    assertThat(body.get("days").get(0).get("date").asText()).isEqualTo("2026-11-13");
    assertThat(body.get("days").get(13).get("date").asText()).isEqualTo("2026-11-26");
    for (var day : body.get("days")) {
      assertThat(day.get("hasAvailableSlots").asBoolean()).isFalse();
      assertThat(day.get("slots")).isEmpty();
      assertThat(day.get("busyIntervals")).isEmpty();
    }
  }

  @Test
  void mergesAdjacentIntervalsAndListsOnlyTypesWithAvailableSlots() throws Exception {
    var availableType = createMeetingType("Разбор", 45);
    createMeetingType("Слишком длинная встреча", 1440);
    putAvailability(
        "UTC",
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"09:45\"},{\"start\":\"09:45\",\"end\":\"10:40\"}],"
            + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");

    var publicTypes = get("/api/booking/meeting-types?timeZone=UTC");
    var availability =
        get(
            "/api/booking/meeting-types/"
                + availableType.get("id").asText()
                + "/availability?timeZone=UTC");

    var types = objectMapper.readTree(publicTypes.body());
    assertThat(types).hasSize(1);
    assertThat(types.get(0).get("id").asText()).isEqualTo(availableType.get("id").asText());
    var monday = objectMapper.readTree(availability.body()).get("days").get(3);
    assertThat(monday.get("date").asText()).isEqualTo("2026-11-16");
    assertThat(monday.get("hasAvailableSlots").asBoolean()).isTrue();
    assertThat(monday.get("slots")).hasSize(2);
    assertThat(monday.get("slots").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-16T09:00:00Z");
    assertThat(monday.get("slots").get(0).get("endsAt").asText()).isEqualTo("2026-11-16T09:45:00Z");
    assertThat(monday.get("slots").get(0).get("status").asText()).isEqualTo("AVAILABLE");
    assertThat(monday.get("slots").get(1).get("startsAt").asText())
        .isEqualTo("2026-11-16T09:45:00Z");
    assertThat(monday.get("slots").get(1).get("endsAt").asText()).isEqualTo("2026-11-16T10:30:00Z");
  }

  @Test
  void appliesCustomAndClosedExceptionsInsteadOfWeeklyTemplate() throws Exception {
    var meetingType = createMeetingType("Особое расписание", 60);
    putAvailability(
        "UTC",
        "{\"MONDAY\":[{\"start\":\"09:00\",\"end\":\"12:00\"}],"
            + "\"TUESDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],\"WEDNESDAY\":[],"
            + "\"THURSDAY\":[],\"FRIDAY\":[],\"SATURDAY\":[],\"SUNDAY\":[]}",
        "[{\"date\":\"2026-11-16\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"14:00\",\"end\":\"15:00\"}]},"
            + "{\"date\":\"2026-11-17\",\"type\":\"CLOSED\",\"intervals\":[]}]");

    var body =
        objectMapper.readTree(
            get("/api/booking/meeting-types/"
                    + meetingType.get("id").asText()
                    + "/availability?timeZone=UTC")
                .body());

    var monday = body.get("days").get(3);
    assertThat(monday.get("slots")).hasSize(1);
    assertThat(monday.get("slots").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-16T14:00:00Z");
    assertThat(body.get("days").get(4).get("slots")).isEmpty();
  }

  @Test
  void allowsSlotAtExactlyFifteenMinutesAndMarksItTooSoonOneSecondLater() throws Exception {
    clock.setInstant(Instant.parse("2026-11-13T08:45:00Z"));
    var meetingType = createMeetingType("Утренняя встреча", 60);
    putAvailability(
        "UTC",
        "{\"MONDAY\":[],\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],"
            + "\"FRIDAY\":[{\"start\":\"09:00\",\"end\":\"10:00\"}],"
            + "\"SATURDAY\":[],\"SUNDAY\":[]}");
    var path =
        "/api/booking/meeting-types/"
            + meetingType.get("id").asText()
            + "/availability?timeZone=UTC";

    var atThreshold = objectMapper.readTree(get(path).body());
    clock.setInstant(Instant.parse("2026-11-13T08:45:01Z"));
    var afterThreshold = objectMapper.readTree(get(path).body());

    assertThat(atThreshold.get("days").get(0).get("slots").get(0).get("status").asText())
        .isEqualTo("AVAILABLE");
    assertThat(afterThreshold.get("days").get(0).get("slots").get(0).get("status").asText())
        .isEqualTo("TOO_SOON");
    assertThat(afterThreshold.get("days").get(0).get("hasAvailableSlots").asBoolean()).isFalse();
  }

  @Test
  void assignsSlotsByGuestStartDateAndAllowsEndAfterLastMidnight() throws Exception {
    var meetingType = createMeetingType("Поздняя встреча", 90);
    var dailyIntervals = "[{\"start\":\"09:00\",\"end\":\"11:00\"}]";
    var template =
        "{\"MONDAY\":"
            + dailyIntervals
            + ",\"TUESDAY\":"
            + dailyIntervals
            + ",\"WEDNESDAY\":"
            + dailyIntervals
            + ",\"THURSDAY\":"
            + dailyIntervals
            + ",\"FRIDAY\":"
            + dailyIntervals
            + ",\"SATURDAY\":"
            + dailyIntervals
            + ",\"SUNDAY\":"
            + dailyIntervals
            + "}";
    putAvailability("UTC", template);

    var body =
        objectMapper.readTree(
            get("/api/booking/meeting-types/"
                    + meetingType.get("id").asText()
                    + "/availability?timeZone=America/Adak")
                .body());

    assertThat(body.get("days")).hasSize(14);
    assertThat(body.get("days").get(0).get("date").asText()).isEqualTo("2026-11-12");
    var lastDay = body.get("days").get(13);
    assertThat(lastDay.get("date").asText()).isEqualTo("2026-11-25");
    assertThat(lastDay.get("slots")).hasSize(1);
    assertThat(lastDay.get("slots").get(0).get("startsAt").asText())
        .isEqualTo("2026-11-26T09:00:00Z");
    assertThat(lastDay.get("slots").get(0).get("endsAt").asText())
        .isEqualTo("2026-11-26T10:30:00Z");
  }

  @Test
  void skipsNonexistentSpringTimeAndUsesActualDurations() throws Exception {
    clock.setInstant(Instant.parse("2027-03-14T00:00:00Z"));
    var meetingType = createMeetingType("Весенний DST", 60);
    putAvailability(
        "America/New_York",
        emptyWeeklyTemplate(),
        "[{\"date\":\"2027-03-14\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"01:00\",\"end\":\"04:00\"}]}]");

    var body =
        objectMapper.readTree(
            get("/api/booking/meeting-types/"
                    + meetingType.get("id").asText()
                    + "/availability?timeZone=America/New_York")
                .body());

    var day = body.get("days").get(1);
    assertThat(day.get("date").asText()).isEqualTo("2027-03-14");
    assertThat(day.get("slots")).hasSize(2);
    assertThat(day.get("slots").get(0).get("startsAt").asText()).isEqualTo("2027-03-14T06:00:00Z");
    assertThat(day.get("slots").get(0).get("endsAt").asText()).isEqualTo("2027-03-14T07:00:00Z");
    assertThat(day.get("slots").get(1).get("startsAt").asText()).isEqualTo("2027-03-14T07:00:00Z");
    assertThat(day.get("slots").get(1).get("endsAt").asText()).isEqualTo("2027-03-14T08:00:00Z");
  }

  @Test
  void usesOnlyFirstRepeatedAutumnTime() throws Exception {
    clock.setInstant(Instant.parse("2027-11-07T00:00:00Z"));
    var meetingType = createMeetingType("Осенний DST", 60);
    putAvailability(
        "America/New_York",
        emptyWeeklyTemplate(),
        "[{\"date\":\"2027-11-07\",\"type\":\"CUSTOM\",\"intervals\":[{\"start\":\"01:00\",\"end\":\"03:00\"}]}]");

    var body =
        objectMapper.readTree(
            get("/api/booking/meeting-types/"
                    + meetingType.get("id").asText()
                    + "/availability?timeZone=America/New_York")
                .body());

    var day = body.get("days").get(1);
    assertThat(day.get("slots")).hasSize(2);
    assertThat(day.get("slots").get(0).get("startsAt").asText()).isEqualTo("2027-11-07T05:00:00Z");
    assertThat(day.get("slots").get(1).get("startsAt").asText()).isEqualTo("2027-11-07T07:00:00Z");
  }

  @Test
  void rejectsInvalidGuestZoneAndUnknownMeetingType() throws Exception {
    var invalidZone = get("/api/booking/meeting-types?timeZone=Mars/Olympus");
    var missingZone = get("/api/booking/meeting-types");
    var unknownType = get("/api/booking/meeting-types/unknown/availability?timeZone=UTC");

    assertThat(invalidZone.statusCode()).isEqualTo(400);
    assertThat(missingZone.statusCode()).isEqualTo(400);
    var problem = objectMapper.readTree(invalidZone.body());
    assertThat(problem.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    assertThat(problem.get("errors").get(0).get("path").asText()).isEqualTo("timeZone");
    assertThat(unknownType.statusCode()).isEqualTo(404);
    assertThat(objectMapper.readTree(unknownType.body()).get("code").asText())
        .isEqualTo("MEETING_TYPE_NOT_FOUND");
  }

  private static String emptyWeeklyTemplate() {
    return "{\"MONDAY\":[],\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],"
        + "\"FRIDAY\":[],\"SATURDAY\":[],\"SUNDAY\":[]}";
  }

  private void putAvailability(String timeZone, String weeklyTemplate) throws Exception {
    putAvailability(timeZone, weeklyTemplate, "[]");
  }

  private void putAvailability(String timeZone, String weeklyTemplate, String exceptions)
      throws Exception {
    var body =
        "{\"timeZone\":\""
            + timeZone
            + "\",\"expectedVersion\":null,\"weeklyTemplate\":"
            + weeklyTemplate
            + ",\"exceptions\":"
            + exceptions
            + "}";
    var response =
        httpClient.send(
            HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/owner/availability"))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).isEqualTo(200);
  }

  private JsonNode createMeetingType(String name, int durationMinutes) throws Exception {
    var body =
        "{\"name\":\""
            + name
            + "\",\"description\":\"Описание\",\"durationMinutes\":"
            + durationMinutes
            + "}";
    var response =
        httpClient.send(
            HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/owner/meeting-types"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).isEqualTo(201);
    return objectMapper.readTree(response.body());
  }

  private HttpResponse<String> get(String path) throws Exception {
    return httpClient.send(
        HttpRequest.newBuilder().uri(URI.create("http://localhost:" + port + path)).GET().build(),
        HttpResponse.BodyHandlers.ofString());
  }

  @TestConfiguration(proxyBeanMethods = false)
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
}
