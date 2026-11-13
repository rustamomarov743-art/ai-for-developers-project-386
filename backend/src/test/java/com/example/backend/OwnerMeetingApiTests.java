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
class OwnerMeetingApiTests {

  @LocalServerPort private int port;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private MutableClock clock;

  private final HttpClient httpClient = HttpClient.newHttpClient();

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
