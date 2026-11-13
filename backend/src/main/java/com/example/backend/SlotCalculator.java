package com.example.backend;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.springframework.stereotype.Component;

@Component
class SlotCalculator {

  private final Clock clock;

  SlotCalculator(Clock clock) {
    this.clock = clock;
  }

  BookingAvailability calculate(
      MeetingType meetingType,
      Availability availability,
      ZoneId guestZone,
      List<BusyInterval> busyIntervals) {
    var today = LocalDate.now(clock.withZone(guestZone));
    var dates = IntStream.range(0, 14).mapToObj(today::plusDays).toList();
    var windowStart = today.atStartOfDay(guestZone).toInstant();
    var windowEnd = today.plusDays(14).atStartOfDay(guestZone).toInstant();
    return calculate(
        meetingType, availability, guestZone, busyIntervals, dates, windowStart, windowEnd);
  }

  Optional<BookingSlot> findAvailableSlotInAnyGuestWindow(
      MeetingType meetingType,
      Availability availability,
      Instant startsAt,
      List<BusyInterval> busyIntervals) {
    var windowStart =
        ZoneId.getAvailableZoneIds().stream()
            .map(ZoneId::of)
            .map(zone -> LocalDate.now(clock.withZone(zone)).atStartOfDay(zone).toInstant())
            .min(Comparator.naturalOrder())
            .orElseThrow();
    var windowEnd =
        ZoneId.getAvailableZoneIds().stream()
            .map(ZoneId::of)
            .map(zone ->
                LocalDate.now(clock.withZone(zone)).plusDays(14).atStartOfDay(zone).toInstant())
            .max(Comparator.naturalOrder())
            .orElseThrow();
    var firstDate = windowStart.atZone(ZoneOffset.UTC).toLocalDate();
    var lastDate = windowEnd.minusNanos(1).atZone(ZoneOffset.UTC).toLocalDate();
    var dates = firstDate.datesUntil(lastDate.plusDays(1)).toList();
    return calculate(
            meetingType, availability, ZoneOffset.UTC, busyIntervals, dates, windowStart, windowEnd)
        .days()
        .stream()
        .flatMap(day -> day.slots().stream())
        .filter(slot -> slot.startsAt().equals(startsAt))
        .filter(slot -> slot.status() == BookingSlotStatus.AVAILABLE)
        .findFirst();
  }

  private BookingAvailability calculate(
      MeetingType meetingType,
      Availability availability,
      ZoneId guestZone,
      List<BusyInterval> busyIntervals,
      List<LocalDate> dates,
      Instant windowStart,
      Instant windowEnd) {
    if (availability == null) {
      return new BookingAvailability(emptyDays(dates, busyIntervals, guestZone));
    }

    var ownerZone = ZoneId.of(availability.timeZone());
    var firstScheduleDate = windowStart.atZone(ownerZone).toLocalDate().minusDays(1);
    var lastScheduleDate = windowEnd.atZone(ownerZone).toLocalDate().plusDays(1);
    var slots =
        dates.stream()
            .collect(Collectors.toMap(Function.identity(), date -> new ArrayList<BookingSlot>()));
    for (var date = firstScheduleDate; !date.isAfter(lastScheduleDate); date = date.plusDays(1)) {
      for (var workInterval : workIntervals(date, availability)) {
        addCandidates(
            meetingType,
            ownerZone,
            guestZone,
            workInterval,
            windowStart,
            windowEnd,
            busyIntervals,
            slots);
      }
    }
    var days =
        dates.stream()
            .map(date -> {
              var daySlots = List.copyOf(slots.get(date));
              return new BookingDayAvailability(
                  date,
                  daySlots.stream().anyMatch(slot -> slot.status() == BookingSlotStatus.AVAILABLE),
                  daySlots,
                  busyIntervalsOn(date, busyIntervals, guestZone));
            })
            .toList();
    return new BookingAvailability(days);
  }

  private void addCandidates(
      MeetingType meetingType,
      ZoneId ownerZone,
      ZoneId guestZone,
      LocalWorkInterval workInterval,
      Instant windowStart,
      Instant windowEnd,
      List<BusyInterval> busyIntervals,
      Map<LocalDate, ArrayList<BookingSlot>> slots) {
    var duration = java.time.Duration.ofMinutes(meetingType.durationMinutes());
    var workEnd = workInterval.endsAt().atZone(ownerZone).toInstant();
    var localStart = workInterval.startsAt();
    Instant instantGridStart = null;
    while (localStart.isBefore(workInterval.endsAt())) {
      Instant startsAt;
      if (instantGridStart != null) {
        startsAt = instantGridStart;
      } else {
        var offsets = ownerZone.getRules().getValidOffsets(localStart);
        if (offsets.isEmpty()) {
          localStart = localStart.plus(duration);
          continue;
        }
        startsAt = ZonedDateTime.ofLocal(localStart, ownerZone, offsets.getFirst()).toInstant();
      }
      var endsAt = startsAt.plus(duration);
      if (endsAt.isAfter(workEnd)) {
        return;
      }
      var finalStartsAt = startsAt;
      var collision =
          busyIntervals.stream()
              .filter(interval ->
                  finalStartsAt.isBefore(interval.endsAt()) && interval.startsAt().isBefore(endsAt))
              .findFirst();
      if (collision.isPresent()) {
        instantGridStart = collision.get().endsAt();
        localStart = instantGridStart.atZone(ownerZone).toLocalDateTime();
        continue;
      }
      if (!startsAt.isBefore(windowStart) && startsAt.isBefore(windowEnd)) {
        var date = startsAt.atZone(guestZone).toLocalDate();
        var status =
            startsAt.isBefore(clock.instant().plus(java.time.Duration.ofMinutes(15)))
                ? BookingSlotStatus.TOO_SOON
                : BookingSlotStatus.AVAILABLE;
        slots.get(date).add(new BookingSlot(startsAt, endsAt, status));
      }
      if (instantGridStart == null) {
        localStart = localStart.plus(duration);
      } else {
        instantGridStart = startsAt.plus(duration);
        localStart = instantGridStart.atZone(ownerZone).toLocalDateTime();
      }
    }
  }

  private static List<LocalWorkInterval> workIntervals(LocalDate date, Availability availability) {
    var exception =
        availability.exceptions().stream()
            .filter(candidate -> candidate.date().equals(date))
            .findFirst();
    var template = availability.weeklyTemplate();
    var intervals =
        exception.isPresent()
            ? exception.get().intervals()
            : switch (date.getDayOfWeek()) {
              case MONDAY -> template.MONDAY();
              case TUESDAY -> template.TUESDAY();
              case WEDNESDAY -> template.WEDNESDAY();
              case THURSDAY -> template.THURSDAY();
              case FRIDAY -> template.FRIDAY();
              case SATURDAY -> template.SATURDAY();
              case SUNDAY -> template.SUNDAY();
            };
    var merged = new ArrayList<LocalWorkInterval>();
    intervals.stream()
        .sorted(Comparator.comparing(TimeInterval::start))
        .forEach(interval -> {
          var start = LocalDateTime.of(date, interval.start());
          var end = LocalDateTime.of(date, interval.end());
          if (!merged.isEmpty() && !start.isAfter(merged.getLast().endsAt())) {
            var previous = merged.removeLast();
            merged.add(new LocalWorkInterval(previous.startsAt(), end));
          } else {
            merged.add(new LocalWorkInterval(start, end));
          }
        });
    return merged;
  }

  private static List<BookingDayAvailability> emptyDays(
      List<LocalDate> dates, List<BusyInterval> busyIntervals, ZoneId guestZone) {
    return dates.stream()
        .map(date ->
            new BookingDayAvailability(
                date, false, List.of(), busyIntervalsOn(date, busyIntervals, guestZone)))
        .toList();
  }

  private static List<BusyInterval> busyIntervalsOn(
      LocalDate date, List<BusyInterval> busyIntervals, ZoneId guestZone) {
    var dayStart = date.atStartOfDay(guestZone).toInstant();
    var dayEnd = date.plusDays(1).atStartOfDay(guestZone).toInstant();
    return busyIntervals.stream()
        .filter(
            interval -> interval.startsAt().isBefore(dayEnd) && interval.endsAt().isAfter(dayStart))
        .sorted(Comparator.comparing(BusyInterval::startsAt))
        .toList();
  }

  private record LocalWorkInterval(LocalDateTime startsAt, LocalDateTime endsAt) {}
}
