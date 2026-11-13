package com.example.backend;

import static com.example.backend.JsonRequests.isPresent;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import tools.jackson.databind.JsonNode;

class AvailabilitySchedule {

  private static final List<String> DAYS =
      List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY");

  private final Clock clock;
  private Availability availability;

  AvailabilitySchedule(Clock clock) {
    this.clock = clock;
  }

  Availability replace(ReplaceAvailabilityRequest request) {
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

  Availability current() {
    return availability;
  }

  Availability view() {
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

  private List<AvailabilityException> validateExceptions(
      JsonNode exceptionsNode, String timeZone, List<ApiFieldError> errors) {
    if (!isPresent(exceptionsNode)) {
      return List.of();
    }
    var exceptions = new ArrayList<AvailabilityException>();
    var exceptionDates = new HashSet<LocalDate>();
    int exceptionIndex = 0;
    for (var exceptionNode : exceptionsNode) {
      var path = "exceptions[" + exceptionIndex + "]";
      LocalDate date = null;
      try {
        date = LocalDate.parse(exceptionNode.get("date").textValue());
        if (!exceptionDates.add(date)) {
          errors.add(new ApiFieldError(path + ".date", "Исключение для этой даты уже добавлено"));
        }
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

      var intervalsNode = exceptionNode.get("intervals");
      var intervals = new ArrayList<TimeInterval>();
      if (!isPresent(intervalsNode)) {
        errors.add(new ApiFieldError(path + ".intervals", "Укажите интервалы исключения"));
      } else {
        intervals.addAll(validateIntervals(intervalsNode, path + ".intervals", errors));
      }
      if (type == AvailabilityExceptionType.CLOSED
          && isPresent(intervalsNode)
          && !intervals.isEmpty()) {
        errors.add(new ApiFieldError(path + ".intervals", "Закрытый день не содержит интервалов"));
      }
      if (type == AvailabilityExceptionType.CUSTOM && intervals.isEmpty()) {
        errors.add(
            new ApiFieldError(
                path + ".intervals", "Особое расписание требует хотя бы один интервал"));
      }
      if (date != null && type != null) {
        exceptions.add(new AvailabilityException(date, type, List.copyOf(intervals)));
      }
      exceptionIndex++;
    }
    exceptions.sort(Comparator.comparing(AvailabilityException::date));
    return List.copyOf(exceptions);
  }

  private static WeeklyTemplate validateWeeklyTemplate(
      JsonNode template, List<ApiFieldError> errors) {
    if (!isPresent(template)) {
      errors.add(new ApiFieldError("weeklyTemplate", "Недельный шаблон обязателен"));
      return null;
    }
    var days = new HashMap<String, List<TimeInterval>>();
    for (var day : DAYS) {
      var intervalsNode = template.get(day);
      if (!isPresent(intervalsNode)) {
        errors.add(new ApiFieldError("weeklyTemplate." + day, "Укажите интервалы дня"));
        continue;
      }
      days.put(day, validateIntervals(intervalsNode, "weeklyTemplate." + day, errors));
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

  private static List<TimeInterval> validateIntervals(
      JsonNode intervalsNode, String path, List<ApiFieldError> errors) {
    var intervals = new ArrayList<TimeInterval>();
    int index = 0;
    for (var interval : intervalsNode) {
      var start = interval.get("start");
      var end = interval.get("end");
      if (!isValidTime(start)) {
        errors.add(new ApiFieldError(path + "[" + index + "].start", "Формат времени — HH:mm"));
      }
      if (!isValidTime(end)) {
        errors.add(new ApiFieldError(path + "[" + index + "].end", "Формат времени — HH:mm"));
      }
      if (isValidTime(start) && isValidTime(end)) {
        var timeInterval = TimeInterval.of(start.textValue(), end.textValue());
        if (!timeInterval.start().isBefore(timeInterval.end())) {
          errors.add(
              new ApiFieldError(
                  path + "[" + index + "].end", "Окончание должно быть позже начала в том же дне"));
        }
        intervals.add(timeInterval);
      }
      index++;
    }
    intervals.sort(Comparator.comparing(TimeInterval::start));
    for (int intervalIndex = 1; intervalIndex < intervals.size(); intervalIndex++) {
      if (intervals.get(intervalIndex - 1).end().isAfter(intervals.get(intervalIndex).start())) {
        errors.add(new ApiFieldError(path, "Интервалы не должны пересекаться"));
      }
    }
    return List.copyOf(intervals);
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
        validateIntervalsJsonTypes(intervals);
      }
    }
    if (!isPresent(request.weeklyTemplate()) || !request.weeklyTemplate().isObject()) {
      return;
    }
    for (var day : DAYS) {
      var intervals = request.weeklyTemplate().get(day);
      if (isPresent(intervals)) {
        validateIntervalsJsonTypes(intervals);
      }
    }
  }

  private static void validateIntervalsJsonTypes(JsonNode intervals) {
    if (intervals != null && !intervals.isArray()) {
      throw new MalformedRequestException();
    }
    if (!isPresent(intervals)) {
      return;
    }
    for (var interval : intervals) {
      if (!interval.isObject()
          || (isPresent(interval.get("start")) && !interval.get("start").isTextual())
          || (isPresent(interval.get("end")) && !interval.get("end").isTextual())) {
        throw new MalformedRequestException();
      }
    }
  }

  private static String validateTimeZone(JsonNode value, List<ApiFieldError> errors) {
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

  private static boolean isValidTime(JsonNode value) {
    return isPresent(value) && value.textValue().matches("^([01][0-9]|2[0-3]):[0-5][0-9]$");
  }
}
