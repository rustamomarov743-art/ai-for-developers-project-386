package com.example.backend;

import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
class OwnerMeetingController {

  private final InMemoryCalendarStore store;

  OwnerMeetingController(InMemoryCalendarStore store) {
    this.store = store;
  }

  @GetMapping("/api/owner/meetings")
  List<OwnerMeeting> listMeetings() {
    return store.upcomingMeetings();
  }

  @PostMapping("/api/owner/meetings/{id}/cancellation")
  Meeting cancelMeeting(@PathVariable String id) {
    return store.cancelMeeting(id);
  }
}
