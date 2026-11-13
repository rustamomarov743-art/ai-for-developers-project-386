package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class SlotCalculatorTests {

  private final SlotCalculator calculator =
      new SlotCalculator(Clock.fixed(Instant.parse("2026-11-13T00:00:00Z"), ZoneOffset.UTC));

  @Test
  void shiftsCandidateToBusyEndAndContinuesWithDurationSteps() {
    var busy =
        new BusyInterval(
            Instant.parse("2026-11-13T10:00:00Z"), Instant.parse("2026-11-13T10:45:00Z"));

    var result =
        calculator.calculate(
            meetingType(45), availability("09:00", "12:30"), ZoneId.of("UTC"), List.of(busy));

    var day = result.days().getFirst();
    assertThat(day.slots())
        .extracting(slot -> slot.startsAt().toString())
        .containsExactly("2026-11-13T09:00:00Z", "2026-11-13T10:45:00Z", "2026-11-13T11:30:00Z");
    assertThat(day.busyIntervals()).containsExactly(busy);
  }

  @Test
  void allowsCandidatesAdjacentToBusyIntervals() {
    var busy =
        new BusyInterval(
            Instant.parse("2026-11-13T09:45:00Z"), Instant.parse("2026-11-13T10:30:00Z"));

    var result =
        calculator.calculate(
            meetingType(45), availability("09:00", "12:30"), ZoneId.of("UTC"), List.of(busy));

    assertThat(result.days().getFirst().slots())
        .extracting(slot -> slot.startsAt().toString())
        .containsExactly("2026-11-13T09:00:00Z", "2026-11-13T10:30:00Z", "2026-11-13T11:15:00Z");
  }

  private static MeetingType meetingType(int durationMinutes) {
    return new MeetingType(
        "type-id", "Встреча", "Описание", durationMinutes, Instant.parse("2026-11-01T00:00:00Z"));
  }

  private static Availability availability(String start, String end) {
    var template =
        new WeeklyTemplate(
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(new TimeInterval(start, end)),
            List.of(),
            List.of());
    return new Availability(true, "UTC", 1, template, List.of());
  }
}
