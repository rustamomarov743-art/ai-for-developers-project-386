package com.example.backend;

import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
class BookingController {

  private final InMemoryCalendarStore store;

  BookingController(InMemoryCalendarStore store) {
    this.store = store;
  }

  @GetMapping("/api/booking/meeting-types")
  List<MeetingType> listMeetingTypes(@RequestParam(required = false) String timeZone) {
    return store.publicMeetingTypes(timeZone);
  }

  @GetMapping("/api/booking/meeting-types/{id}/availability")
  BookingAvailability getAvailability(
      @PathVariable String id, @RequestParam(required = false) String timeZone) {
    return store.bookingAvailability(id, timeZone);
  }
}
