package com.example.backend;

import java.time.Clock;
import java.time.ZoneId;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
class InMemoryCalendarStore {

  private final SlotCalculator slotCalculator;
  private final MeetingTypeCatalog meetingTypes;
  private final AvailabilitySchedule availability;
  private final MeetingRegistry meetings;
  private final BookingService bookings;

  InMemoryCalendarStore(Clock clock, SlotCalculator slotCalculator) {
    this.slotCalculator = slotCalculator;
    this.meetingTypes = new MeetingTypeCatalog(clock);
    this.availability = new AvailabilitySchedule(clock);
    this.meetings = new MeetingRegistry(clock);
    this.bookings = new BookingService(slotCalculator);
  }

  synchronized MeetingType createMeetingType(CreateMeetingTypeRequest request) {
    return meetingTypes.create(request);
  }

  synchronized Availability replaceAvailability(ReplaceAvailabilityRequest request) {
    return availability.replace(request);
  }

  synchronized Availability availability() {
    return availability.view();
  }

  synchronized List<MeetingType> meetingTypes() {
    return meetingTypes.list();
  }

  synchronized List<MeetingType> publicMeetingTypes(String timeZone) {
    var guestZone = guestZone(timeZone);
    if (availability.current() == null) {
      return List.of();
    }
    return meetingTypes.list().stream()
        .filter(meetingType ->
            slotCalculator
                .calculate(meetingType, availability.current(), guestZone, meetings.busyIntervals())
                .hasAvailableSlots())
        .toList();
  }

  synchronized BookingAvailability bookingAvailability(String id, String timeZone) {
    var guestZone = guestZone(timeZone);
    var meetingType = meetingTypes.find(id).orElseThrow(MeetingTypeNotFoundException::new);
    return slotCalculator.calculate(
        meetingType, availability.current(), guestZone, meetings.busyIntervals());
  }

  synchronized List<OwnerMeeting> upcomingMeetings() {
    return meetings.upcoming();
  }

  synchronized Meeting cancelMeeting(String id) {
    return meetings.cancel(id);
  }

  synchronized Meeting createBooking(CreateBookingRequest request) {
    return bookings.create(request, meetingTypes, availability, meetings);
  }

  private static ZoneId guestZone(String timeZone) {
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
}
