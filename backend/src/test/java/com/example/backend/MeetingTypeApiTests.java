package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;

class MeetingTypeApiTests extends CalendarApiTestBase {

  @Test
  void createsMeetingTypeWithTrimmedFieldsAndUtcCreationTime() throws Exception {
    var response =
        send(
            "/api/owner/meeting-types",
            "POST",
            "{\"name\":\"  Консультация  \",\"description\":\"  Обсудим проект  \",\"durationMinutes\":37}");

    assertThat(response.statusCode()).isEqualTo(201);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));
    JsonNode body = objectMapper.readTree(response.body());
    assertThat(body.get("id").asText()).isNotBlank();
    assertThat(body.get("name").asText()).isEqualTo("Консультация");
    assertThat(body.get("description").asText()).isEqualTo("Обсудим проект");
    assertThat(body.get("durationMinutes").asInt()).isEqualTo(37);
    assertThat(Instant.parse(body.get("createdAt").asText())).isNotNull();
    assertThat(body.has("sequence")).isFalse();
  }

  @Test
  void listsMeetingTypesInRegistrationOrderWhenCreationTimesAreEqual() throws Exception {
    postMeetingType(
        "{\"name\":\"Первый тип для порядка\",\"description\":\"Описание\",\"durationMinutes\":15}");
    postMeetingType(
        "{\"name\":\"Второй тип для порядка\",\"description\":\"Описание\",\"durationMinutes\":45}");
    var response = send("/api/owner/meeting-types", "GET", null);

    assertThat(response.statusCode()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.body());
    var names = new ArrayList<String>();
    body.forEach(item -> names.add(item.get("name").asText()));
    assertThat(names).containsSubsequence("Первый тип для порядка", "Второй тип для порядка");
    assertThat(body.get(0).get("createdAt").asText()).isEqualTo("2026-11-13T09:00:00Z");
  }

  @Test
  void rejectsCaseInsensitiveDuplicateNameWithoutCreatingAnotherType() throws Exception {
    postMeetingType(
        "{\"name\":\"Разбор целей\",\"description\":\"Первый\",\"durationMinutes\":30}");

    var response =
        postMeetingType(
            "{\"name\":\"разбор ЦЕЛЕЙ\",\"description\":\"Дубликат\",\"durationMinutes\":60}");

    assertThat(response.statusCode()).isEqualTo(409);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
    JsonNode body = objectMapper.readTree(response.body());
    assertThat(body.get("code").asText()).isEqualTo("MEETING_TYPE_NAME_CONFLICT");
    assertThat(body.get("errors").get(0).get("path").asText()).isEqualTo("name");

    var listResponse = send("/api/owner/meeting-types", "GET", null);
    var matchingNames = new ArrayList<String>();
    objectMapper
        .readTree(listResponse.body())
        .forEach(item -> {
          if (item.get("name").asText().equalsIgnoreCase("Разбор целей")) {
            matchingNames.add(item.get("name").asText());
          }
        });
    assertThat(matchingNames).hasSize(1);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "{\"name\":",
        "{\"name\":42,\"description\":\"Описание\",\"durationMinutes\":30}",
        "{\"name\":\"Тип\",\"description\":\"Описание\",\"durationMinutes\":\"30\"}"
      })
  void rejectsMalformedRequestWithProblemDetails(String requestBody) throws Exception {
    var response = postMeetingType(requestBody);

    assertThat(response.statusCode()).isEqualTo(400);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
    JsonNode body = objectMapper.readTree(response.body());
    assertThat(body.get("status").asInt()).isEqualTo(400);
    assertThat(body.get("code").asText()).isEqualTo("MALFORMED_REQUEST");
    assertThat(body.has("errors")).isFalse();
  }

  @ParameterizedTest
  @MethodSource("invalidMeetingTypeRequests")
  void rejectsInvalidFieldsWithProblemDetails(String requestBody, String expectedPath)
      throws Exception {
    var response = postMeetingType(requestBody);

    assertThat(response.statusCode()).isEqualTo(400);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
    JsonNode body = objectMapper.readTree(response.body());
    assertThat(body.get("type").asText()).isEqualTo("about:blank");
    assertThat(body.get("title").asText()).isEqualTo("Bad Request");
    assertThat(body.get("status").asInt()).isEqualTo(400);
    assertThat(body.get("detail").asText()).isNotBlank();
    assertThat(body.get("instance").asText()).isEqualTo("/api/owner/meeting-types");
    assertThat(body.get("code").asText()).isEqualTo("VALIDATION_ERROR");
    var paths = new ArrayList<String>();
    body.get("errors").forEach(error -> paths.add(error.get("path").asText()));
    assertThat(paths).contains(expectedPath);
  }

  static Stream<Arguments> invalidMeetingTypeRequests() {
    return Stream.of(
        Arguments.of(
            "{\"name\":\" \",\"description\":\"Описание\",\"durationMinutes\":30}", "name"),
        Arguments.of(
            "{\"name\":\"Тип\",\"description\":\" \",\"durationMinutes\":30}", "description"),
        Arguments.of(
            "{\"name\":\"Тип\",\"description\":\"Описание\",\"durationMinutes\":0}",
            "durationMinutes"),
        Arguments.of(
            "{\"name\":\"Тип\",\"description\":\"Описание\",\"durationMinutes\":1441}",
            "durationMinutes"),
        Arguments.of(
            "{\"name\":\"Тип\",\"description\":\"Описание\",\"durationMinutes\":1.5}",
            "durationMinutes"),
        Arguments.of(
            "{\"name\":\""
                + "а".repeat(101)
                + "\",\"description\":\"Описание\",\"durationMinutes\":30}",
            "name"),
        Arguments.of(
            "{\"name\":\"Тип\",\"description\":\""
                + "а".repeat(1001)
                + "\",\"durationMinutes\":30}",
            "description"));
  }

  private HttpResponse<String> postMeetingType(String body) throws Exception {
    return send("/api/owner/meeting-types", "POST", body);
  }
}
