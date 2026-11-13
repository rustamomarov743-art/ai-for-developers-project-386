package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class OwnerMeetingApiTests extends CalendarApiTestBase {

  @Test
  void returnsEmptyUpcomingMeetingList() throws Exception {
    var response = getOwnerMeetings();

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));
    assertThat(objectMapper.readTree(response.body()).isArray()).isTrue();
    assertThat(objectMapper.readTree(response.body())).isEmpty();
  }

  @Test
  void returnsSortedUpcomingMeetingsWithProgressAtExactTimeBoundaries() throws Exception {
    var meetingType = createMeetingType("Консультация", 45);
    putAvailability();
    createBooking(meetingType, "2026-11-16T11:00:00Z", "Третий гость");
    createBooking(meetingType, "2026-11-16T08:00:00Z", "Первый гость");
    createBooking(meetingType, "2026-11-16T08:45:00Z", "Второй гость");
    clock.setInstant(Instant.parse("2026-11-16T08:15:00Z"));

    var response = getOwnerMeetings();

    assertThat(response.statusCode()).isEqualTo(200);
    var body = objectMapper.readTree(response.body());
    assertThat(body).hasSize(3);
    assertThat(body.get(0).get("startsAt").asText()).isEqualTo("2026-11-16T08:00:00Z");
    assertThat(body.get(1).get("startsAt").asText()).isEqualTo("2026-11-16T08:45:00Z");
    assertThat(body.get(2).get("startsAt").asText()).isEqualTo("2026-11-16T11:00:00Z");
    assertThat(body.get(0).get("endsAt").asText()).isEqualTo("2026-11-16T08:45:00Z");
    assertThat(body.get(0).get("durationMinutes").asInt()).isEqualTo(45);
    assertThat(body.get(0).get("guestName").asText()).isEqualTo("Первый гость");
    assertThat(body.get(0).get("guestEmail").asText()).isEqualTo("guest@example.com");
    assertThat(body.get(0).get("meetingType")).isEqualTo(meetingType);
    assertThat(body.get(0).get("inProgress").asBoolean()).isTrue();
    assertThat(body.get(1).get("inProgress").asBoolean()).isFalse();
    assertThat(body.get(2).get("inProgress").asBoolean()).isFalse();

    clock.setInstant(Instant.parse("2026-11-16T08:45:00Z"));
    var atFirstEnd = objectMapper.readTree(getOwnerMeetings().body());
    assertThat(atFirstEnd).hasSize(2);
    assertThat(atFirstEnd.get(0).get("startsAt").asText()).isEqualTo("2026-11-16T08:45:00Z");
    assertThat(atFirstEnd.get(0).get("inProgress").asBoolean()).isTrue();

    clock.setInstant(Instant.parse("2026-11-16T11:45:00Z"));
    assertThat(objectMapper.readTree(getOwnerMeetings().body())).isEmpty();
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
                + "\"weeklyTemplate\":{\"MONDAY\":[{\"start\":\"08:00\",\"end\":\"12:00\"}],"
                + "\"TUESDAY\":[],\"WEDNESDAY\":[],\"THURSDAY\":[],\"FRIDAY\":[],"
                + "\"SATURDAY\":[],\"SUNDAY\":[]},\"exceptions\":[]}");
    assertThat(response.statusCode()).isEqualTo(200);
  }

  private void createBooking(JsonNode meetingType, String startsAt, String guestName)
      throws Exception {
    var response =
        send(
            "/api/booking/bookings",
            "POST",
            "{\"meetingTypeId\":\""
                + meetingType.get("id").asText()
                + "\",\"startsAt\":\""
                + startsAt
                + "\",\"guestName\":\""
                + guestName
                + "\",\"guestEmail\":\"guest@example.com\"}");
    assertThat(response.statusCode()).isEqualTo(201);
  }

  private HttpResponse<String> getOwnerMeetings() throws Exception {
    return send("/api/owner/meetings", "GET", null);
  }
}
