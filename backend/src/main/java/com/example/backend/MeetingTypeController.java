package com.example.backend;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
class MeetingTypeController {

  private final InMemoryCalendarStore store;

  MeetingTypeController(InMemoryCalendarStore store) {
    this.store = store;
  }

  @GetMapping("/api/owner/meeting-types")
  List<MeetingType> listMeetingTypes() {
    return store.meetingTypes();
  }

  @PostMapping("/api/owner/meeting-types")
  @ResponseStatus(HttpStatus.CREATED)
  MeetingType createMeetingType(@RequestBody CreateMeetingTypeRequest request) {
    return store.createMeetingType(request);
  }
}
