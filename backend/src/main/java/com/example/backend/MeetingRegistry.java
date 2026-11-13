package com.example.backend;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

class MeetingRegistry {

  private final Clock clock;
  private final List<Meeting> meetings = new ArrayList<>();

  MeetingRegistry(Clock clock) {
    this.clock = clock;
  }

  Meeting book(MeetingType meetingType, BookingSlot slot, String guestName, String guestEmail) {
    var meeting =
        new Meeting(
            UUID.randomUUID().toString(),
            meetingType.id(),
            slot.startsAt(),
            slot.endsAt(),
            guestName,
            guestEmail,
            clock.instant(),
            MeetingStatus.SCHEDULED,
            meetingType);
    meetings.add(meeting);
    return meeting;
  }

  List<OwnerMeeting> upcoming() {
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

  Meeting cancel(String id) {
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

  List<BusyInterval> busyIntervals() {
    return meetings.stream()
        .filter(meeting -> meeting.status() == MeetingStatus.SCHEDULED)
        .map(meeting -> new BusyInterval(meeting.startsAt(), meeting.endsAt()))
        .toList();
  }
}
