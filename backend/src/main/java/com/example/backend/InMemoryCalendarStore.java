package com.example.backend;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
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
  private final SlotCalculator slotCalculator;
  private final List<StoredMeetingType> meetingTypes = new ArrayList<>();
  private final List<Meeting> meetings = new ArrayList<>();
  private Availability availability;
  private long nextSequence;

  InMemoryCalendarStore(Clock clock, SlotCalculator slotCalculator) {
    this.clock = clock;
    this.slotCalculator = slotCalculator;
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
    var exceptions = validateExceptions(request.exceptions(), timeZone, errors);
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
    availability = new Availability(true, timeZone, nextVersion, template, exceptions);
    return availability;
  }

  private List<AvailabilityException> validateExceptions(
      JsonNode exceptionsNode, String timeZone, List<ApiFieldError> errors) {
    if (!isPresent(exceptionsNode)) {
      return List.of();
    }
    var exceptions = new ArrayList<AvailabilityException>();
    int exceptionIndex = 0;
    for (var exceptionNode : exceptionsNode) {
      var path = "exceptions[" + exceptionIndex + "]";
      LocalDate date = null;
      try {
        date = LocalDate.parse(exceptionNode.get("date").textValue());
        if (timeZone != null && date.isBefore(LocalDate.now(clock.withZone(ZoneId.of(timeZone))))) {
          errors.add(new ApiFieldError(path + ".date", "Дата исключения не может быть в прошлом"));
        }
      } catch (RuntimeException exception) {
        errors.add(new ApiFieldError(path + ".date", "Укажите дату в формате ГГГГ-ММ-ДД"));
      }

      AvailabilityExceptionType type = null;
      try {
        type = AvailabilityExceptionType.valueOf(exceptionNode.get("type").textValue());
      } catch (RuntimeException exception) {
        errors.add(new ApiFieldError(path + ".type", "Тип исключения — CLOSED или CUSTOM"));
      }

      var intervals = new ArrayList<TimeInterval>();
      var intervalsNode = exceptionNode.get("intervals");
      if (!isPresent(intervalsNode)) {
        errors.add(new ApiFieldError(path + ".intervals", "Укажите интервалы исключения"));
      } else {
        int intervalIndex = 0;
        for (var interval : intervalsNode) {
          var start = interval.get("start");
          var end = interval.get("end");
          if (!isValidTime(start)) {
            errors.add(
                new ApiFieldError(
                    path + ".intervals[" + intervalIndex + "].start", "Формат времени — HH:mm"));
          }
          if (!isValidTime(end)) {
            errors.add(
                new ApiFieldError(
                    path + ".intervals[" + intervalIndex + "].end", "Формат времени — HH:mm"));
          }
          if (isValidTime(start) && isValidTime(end)) {
            if (start.textValue().compareTo(end.textValue()) >= 0) {
              errors.add(
                  new ApiFieldError(
                      path + ".intervals[" + intervalIndex + "].end",
                      "Окончание должно быть позже начала в том же дне"));
            }
            intervals.add(new TimeInterval(start.textValue(), end.textValue()));
          }
          intervalIndex++;
        }
      }
      intervals.sort(Comparator.comparing(TimeInterval::start));
      for (int intervalIndex = 1; intervalIndex < intervals.size(); intervalIndex++) {
        if (intervals.get(intervalIndex - 1).end().compareTo(intervals.get(intervalIndex).start())
            > 0) {
          errors.add(new ApiFieldError(path + ".intervals", "Интервалы не должны пересекаться"));
        }
      }
      if (type == AvailabilityExceptionType.CLOSED
          && isPresent(intervalsNode)
          && !intervals.isEmpty()) {
        errors.add(new ApiFieldError(path + ".intervals", "Закрытый день не содержит интервалов"));
      }
      if (type == AvailabilityExceptionType.CUSTOM && intervals.isEmpty()) {
        errors.add(
            new ApiFieldError(path + ".intervals", "Особый день требует хотя бы один интервал"));
      }
      if (date != null && type != null) {
        exceptions.add(new AvailabilityException(date, type, List.copyOf(intervals)));
      }
      exceptionIndex++;
    }
    exceptions.sort(Comparator.comparing(AvailabilityException::date));
    return List.copyOf(exceptions);
  }

  private static void validateJsonTypes(ReplaceAvailabilityRequest request) {
    if ((isPresent(request.timeZone()) && !request.timeZone().isTextual())
        || (isPresent(request.expectedVersion()) && !request.expectedVersion().isInt())
        || (isPresent(request.weeklyTemplate()) && !request.weeklyTemplate().isObject())) {
      throw new MalformedRequestException();
    }
    if (request.exceptions() != null) {
      if (!request.exceptions().isArray()) {
        throw new MalformedRequestException();
      }
      for (var exception : request.exceptions()) {
        if (!exception.isObject()
            || (isPresent(exception.get("date")) && !exception.get("date").isTextual())
            || (isPresent(exception.get("type")) && !exception.get("type").isTextual())) {
          throw new MalformedRequestException();
        }
        var intervals = exception.get("intervals");
        if (intervals != null && !intervals.isArray()) {
          throw new MalformedRequestException();
        }
        if (isPresent(intervals)) {
          for (var interval : intervals) {
            if (!interval.isObject()
                || (isPresent(interval.get("start")) && !interval.get("start").isTextual())
                || (isPresent(interval.get("end")) && !interval.get("end").isTextual())) {
              throw new MalformedRequestException();
            }
          }
        }
      }
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
    if (availability == null) {
      return Availability.absent();
    }
    var today = LocalDate.now(clock.withZone(ZoneId.of(availability.timeZone())));
    var currentExceptions =
        availability.exceptions().stream()
            .filter(exception -> !exception.date().isBefore(today))
            .toList();
    return new Availability(
        true,
        availability.timeZone(),
        availability.version(),
        availability.weeklyTemplate(),
        currentExceptions);
  }

  synchronized List<MeetingType> meetingTypes() {
    return meetingTypes.stream()
        .sorted(
            Comparator.comparing((StoredMeetingType stored) -> stored.meetingType().createdAt())
                .thenComparingLong(StoredMeetingType::sequence))
        .map(StoredMeetingType::meetingType)
        .toList();
  }

  synchronized List<MeetingType> publicMeetingTypes(String timeZone) {
    var guestZone = guestZone(timeZone);
    if (availability == null) {
      return List.of();
    }
    return meetingTypes().stream()
        .filter(meetingType ->
            slotCalculator
                .calculate(meetingType, availability, guestZone, busyIntervals())
                .hasAvailableSlots())
        .toList();
  }

  synchronized BookingAvailability bookingAvailability(String id, String timeZone) {
    var guestZone = guestZone(timeZone);
    var meetingType =
        meetingTypes().stream()
            .filter(candidate -> candidate.id().equals(id))
            .findFirst()
            .orElseThrow(MeetingTypeNotFoundException::new);
    return slotCalculator.calculate(meetingType, availability, guestZone, busyIntervals());
  }

  synchronized List<OwnerMeeting> upcomingMeetings() {
    var now = clock.instant();
    return meetings.stream()
        .filter(meeting -> meeting.status() == MeetingStatus.SCHEDULED)
        .filter(meeting -> meeting.endsAt().isAfter(now))
        .sorted(Comparator.comparing(Meeting::startsAt))
        .map(meeting ->
            new OwnerMeeting(
                meeting.id(),
                meeting.meetingTypeId(),
                meeting.startsAt(),
                meeting.endsAt(),
                meeting.guestName(),
                meeting.guestEmail(),
                meeting.createdAt(),
                meeting.status(),
                meeting.meetingType(),
                meeting.meetingType().durationMinutes(),
                !meeting.startsAt().isAfter(now)))
        .toList();
  }

  synchronized Meeting cancelMeeting(String id) {
    for (int index = 0; index < meetings.size(); index++) {
      var meeting = meetings.get(index);
      if (!meeting.id().equals(id)) {
        continue;
      }
      if (meeting.status() == MeetingStatus.CANCELLED) {
        throw new MeetingAlreadyCancelledException();
      }
      if (!meeting.startsAt().isAfter(clock.instant())) {
        throw new MeetingAlreadyStartedException();
      }
      var cancelled =
          new Meeting(
              meeting.id(),
              meeting.meetingTypeId(),
              meeting.startsAt(),
              meeting.endsAt(),
              meeting.guestName(),
              meeting.guestEmail(),
              meeting.createdAt(),
              MeetingStatus.CANCELLED,
              meeting.meetingType());
      meetings.set(index, cancelled);
      return cancelled;
    }
    throw new MeetingNotFoundException();
  }

  synchronized Meeting createBooking(CreateBookingRequest request) {
    var validated = validateBooking(request);
    var meetingType =
        meetingTypes().stream()
            .filter(candidate -> candidate.id().equals(validated.meetingTypeId()))
            .findFirst()
            .orElseThrow(SlotUnavailableException::new);
    var calculated =
        slotCalculator.calculate(meetingType, availability, ZoneOffset.UTC, busyIntervals());
    var slot =
        calculated.days().stream()
            .flatMap(day -> day.slots().stream())
            .filter(candidate -> candidate.startsAt().equals(validated.startsAt()))
            .findFirst()
            .orElseThrow(SlotUnavailableException::new);
    if (slot.status() != BookingSlotStatus.AVAILABLE) {
      throw new SlotUnavailableException();
    }
    var meeting =
        new Meeting(
            UUID.randomUUID().toString(),
            meetingType.id(),
            slot.startsAt(),
            slot.endsAt(),
            validated.guestName(),
            validated.guestEmail(),
            clock.instant(),
            MeetingStatus.SCHEDULED,
            meetingType);
    meetings.add(meeting);
    return meeting;
  }

  private static ValidatedBooking validateBooking(CreateBookingRequest request) {
    if ((isPresent(request.meetingTypeId()) && !request.meetingTypeId().isTextual())
        || (isPresent(request.startsAt()) && !request.startsAt().isTextual())
        || (isPresent(request.guestName()) && !request.guestName().isTextual())
        || (isPresent(request.guestEmail()) && !request.guestEmail().isTextual())) {
      throw new MalformedRequestException();
    }
    var errors = new ArrayList<ApiFieldError>();
    var meetingTypeId =
        isPresent(request.meetingTypeId()) ? request.meetingTypeId().textValue().trim() : "";
    if (meetingTypeId.isEmpty()) {
      errors.add(new ApiFieldError("meetingTypeId", "Тип встречи обязателен"));
    }
    java.time.Instant startsAt = null;
    try {
      startsAt =
          java.time.Instant.parse(
              isPresent(request.startsAt()) ? request.startsAt().textValue().trim() : "");
    } catch (RuntimeException exception) {
      errors.add(new ApiFieldError("startsAt", "Укажите начало встречи в формате ISO 8601 UTC"));
    }
    var guestName = isPresent(request.guestName()) ? request.guestName().textValue().trim() : "";
    if (guestName.isEmpty()) {
      errors.add(new ApiFieldError("guestName", "Имя обязательно"));
    } else if (guestName.length() > 100) {
      errors.add(new ApiFieldError("guestName", "Имя должно содержать не более 100 символов"));
    }
    var guestEmail = isPresent(request.guestEmail()) ? request.guestEmail().textValue().trim() : "";
    if (guestEmail.isEmpty()) {
      errors.add(new ApiFieldError("guestEmail", "Email обязателен"));
    } else if (guestEmail.length() > 254) {
      errors.add(new ApiFieldError("guestEmail", "Email должен содержать не более 254 символов"));
    } else if (!isValidEmail(guestEmail)) {
      errors.add(new ApiFieldError("guestEmail", "Укажите корректный email"));
    }
    if (!errors.isEmpty()) {
      throw new RequestValidationException(errors);
    }
    return new ValidatedBooking(meetingTypeId, startsAt, guestName, guestEmail);
  }

  private static boolean isValidEmail(String email) {
    var at = email.indexOf('@');
    return at > 0
        && at == email.lastIndexOf('@')
        && at < email.length() - 1
        && email.chars().noneMatch(Character::isWhitespace);
  }

  private List<BusyInterval> busyIntervals() {
    return meetings.stream()
        .filter(meeting -> meeting.status() == MeetingStatus.SCHEDULED)
        .map(meeting -> new BusyInterval(meeting.startsAt(), meeting.endsAt()))
        .toList();
  }

  private ZoneId guestZone(String timeZone) {
    if (timeZone == null || timeZone.isBlank()) {
      throw new RequestValidationException(
          List.of(new ApiFieldError("timeZone", "Часовой пояс обязателен")));
    }
    try {
      return ZoneId.of(timeZone.trim());
    } catch (RuntimeException exception) {
      throw new RequestValidationException(
          List.of(new ApiFieldError("timeZone", "Укажите корректный IANA-часовой пояс")));
    }
  }

  private record ValidatedBooking(
      String meetingTypeId, java.time.Instant startsAt, String guestName, String guestEmail) {}

  private record StoredMeetingType(MeetingType meetingType, long sequence) {}
}
