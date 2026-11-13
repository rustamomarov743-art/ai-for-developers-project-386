package com.example.backend;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
class InMemoryCalendarStore {

  private final Clock clock;
  private final List<StoredMeetingType> meetingTypes = new ArrayList<>();
  private long nextSequence;

  InMemoryCalendarStore(Clock clock) {
    this.clock = clock;
  }

  synchronized MeetingType createMeetingType(CreateMeetingTypeRequest request) {
    if ((isPresent(request.name()) && !request.name().isTextual())
        || (isPresent(request.description()) && !request.description().isTextual())
        || (isPresent(request.durationMinutes()) && !request.durationMinutes().isNumber())) {
      throw new MalformedRequestException();
    }

    var errors = new ArrayList<ApiFieldError>();
    var name = isPresent(request.name()) ? request.name().textValue().trim() : "";
    var description =
        isPresent(request.description()) ? request.description().textValue().trim() : "";
    if (name.isEmpty()) {
      errors.add(new ApiFieldError("name", "Название обязательно"));
    } else if (name.length() > 100) {
      errors.add(new ApiFieldError("name", "Название должно содержать не более 100 символов"));
    }
    if (description.isEmpty()) {
      errors.add(new ApiFieldError("description", "Описание обязательно"));
    } else if (description.length() > 1000) {
      errors.add(
          new ApiFieldError("description", "Описание должно содержать не более 1000 символов"));
    }
    if (!isPresent(request.durationMinutes())
        || !request.durationMinutes().isInt()
        || request.durationMinutes().intValue() < 1
        || request.durationMinutes().intValue() > 1440) {
      errors.add(
          new ApiFieldError(
              "durationMinutes", "Длительность должна быть целым числом от 1 до 1440 минут"));
    }
    if (!errors.isEmpty()) {
      throw new RequestValidationException(errors);
    }
    if (meetingTypes.stream()
        .map(StoredMeetingType::meetingType)
        .anyMatch(existing -> existing.name().equalsIgnoreCase(name))) {
      throw new MeetingTypeNameConflictException();
    }

    var meetingType =
        new MeetingType(
            UUID.randomUUID().toString(),
            name,
            description,
            request.durationMinutes().intValue(),
            clock.instant());
    meetingTypes.add(new StoredMeetingType(meetingType, nextSequence++));
    return meetingType;
  }

  private static boolean isPresent(JsonNode value) {
    return value != null && !value.isNull();
  }

  synchronized List<MeetingType> meetingTypes() {
    return meetingTypes.stream()
        .sorted(
            Comparator.comparing((StoredMeetingType stored) -> stored.meetingType().createdAt())
                .thenComparingLong(StoredMeetingType::sequence))
        .map(StoredMeetingType::meetingType)
        .toList();
  }

  private record StoredMeetingType(MeetingType meetingType, long sequence) {}
}
