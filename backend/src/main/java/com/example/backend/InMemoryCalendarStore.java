package com.example.backend;

import java.time.Clock;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
class InMemoryCalendarStore {

  private static final List<String> DAYS =
      List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY");

  private final Clock clock;
  private final List<StoredMeetingType> meetingTypes = new ArrayList<>();
  private Availability availability;
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

  synchronized Availability replaceAvailability(ReplaceAvailabilityRequest request) {
    validateJsonTypes(request);
    var errors = new ArrayList<ApiFieldError>();
    var timeZone = validateTimeZone(request.timeZone(), errors);
    var template = validateWeeklyTemplate(request.weeklyTemplate(), errors);
    if (availability != null && timeZone != null && !availability.timeZone().equals(timeZone)) {
      errors.add(new ApiFieldError("timeZone", "Часовой пояс нельзя изменить после создания"));
    }
    if (!errors.isEmpty()) {
      throw new RequestValidationException(errors);
    }

    Integer expectedVersion =
        isPresent(request.expectedVersion()) ? request.expectedVersion().intValue() : null;
    if ((availability == null && expectedVersion != null)
        || (availability != null && !availability.version().equals(expectedVersion))) {
      throw new AvailabilityVersionConflictException();
    }
    var nextVersion = availability == null ? 1 : availability.version() + 1;
    availability = new Availability(true, timeZone, nextVersion, template);
    return availability;
  }

  private static void validateJsonTypes(ReplaceAvailabilityRequest request) {
    if ((isPresent(request.timeZone()) && !request.timeZone().isTextual())
        || (isPresent(request.expectedVersion()) && !request.expectedVersion().isInt())
        || (isPresent(request.weeklyTemplate()) && !request.weeklyTemplate().isObject())) {
      throw new MalformedRequestException();
    }
    if (!isPresent(request.weeklyTemplate()) || !request.weeklyTemplate().isObject()) {
      return;
    }
    for (var day : DAYS) {
      var intervals = request.weeklyTemplate().get(day);
      if (!isPresent(intervals)) {
        continue;
      }
      if (!intervals.isArray()) {
        throw new MalformedRequestException();
      }
      for (var interval : intervals) {
        if (!interval.isObject()
            || (isPresent(interval.get("start")) && !interval.get("start").isTextual())
            || (isPresent(interval.get("end")) && !interval.get("end").isTextual())) {
          throw new MalformedRequestException();
        }
      }
    }
  }

  private String validateTimeZone(JsonNode value, List<ApiFieldError> errors) {
    if (!isPresent(value) || value.textValue().isBlank()) {
      errors.add(new ApiFieldError("timeZone", "Часовой пояс обязателен"));
      return null;
    }
    var timeZone = value.textValue().trim();
    try {
      ZoneId.of(timeZone);
    } catch (RuntimeException exception) {
      errors.add(new ApiFieldError("timeZone", "Укажите корректный IANA-часовой пояс"));
      return null;
    }
    return timeZone;
  }

  private static WeeklyTemplate validateWeeklyTemplate(
      JsonNode template, List<ApiFieldError> errors) {
    if (!isPresent(template)) {
      errors.add(new ApiFieldError("weeklyTemplate", "Недельный шаблон обязателен"));
      return null;
    }
    var days = new java.util.HashMap<String, List<TimeInterval>>();
    for (var day : DAYS) {
      var intervalsNode = template.get(day);
      if (!isPresent(intervalsNode)) {
        errors.add(new ApiFieldError("weeklyTemplate." + day, "Укажите интервалы дня"));
        continue;
      }
      var intervals = new ArrayList<TimeInterval>();
      int index = 0;
      for (var interval : intervalsNode) {
        var start = interval.get("start");
        var end = interval.get("end");
        if (!isValidTime(start)) {
          errors.add(
              new ApiFieldError(
                  "weeklyTemplate." + day + "[" + index + "].start", "Формат времени — HH:mm"));
        }
        if (!isValidTime(end)) {
          errors.add(
              new ApiFieldError(
                  "weeklyTemplate." + day + "[" + index + "].end", "Формат времени — HH:mm"));
        }
        if (isValidTime(start) && isValidTime(end)) {
          if (start.textValue().compareTo(end.textValue()) >= 0) {
            errors.add(
                new ApiFieldError(
                    "weeklyTemplate." + day + "[" + index + "].end",
                    "Окончание должно быть позже начала в том же дне"));
          }
          intervals.add(new TimeInterval(start.textValue(), end.textValue()));
        }
        index++;
      }
      intervals.sort(Comparator.comparing(TimeInterval::start));
      for (int intervalIndex = 1; intervalIndex < intervals.size(); intervalIndex++) {
        if (intervals.get(intervalIndex - 1).end().compareTo(intervals.get(intervalIndex).start())
            > 0) {
          errors.add(
              new ApiFieldError("weeklyTemplate." + day, "Интервалы не должны пересекаться"));
        }
      }
      days.put(day, List.copyOf(intervals));
    }
    return new WeeklyTemplate(
        days.get("MONDAY"),
        days.get("TUESDAY"),
        days.get("WEDNESDAY"),
        days.get("THURSDAY"),
        days.get("FRIDAY"),
        days.get("SATURDAY"),
        days.get("SUNDAY"));
  }

  private static boolean isValidTime(JsonNode value) {
    return isPresent(value) && value.textValue().matches("^([01][0-9]|2[0-3]):[0-5][0-9]$");
  }

  private static boolean isPresent(JsonNode value) {
    return value != null && !value.isNull();
  }

  synchronized Availability availability() {
    return availability == null ? Availability.absent() : availability;
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
