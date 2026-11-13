package com.example.backend;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
class AvailabilityController {

  private final InMemoryCalendarStore store;

  AvailabilityController(InMemoryCalendarStore store) {
    this.store = store;
  }

  @GetMapping("/api/owner/availability")
  Availability getAvailability() {
    return store.availability();
  }

  @PutMapping("/api/owner/availability")
  Availability replaceAvailability(@RequestBody ReplaceAvailabilityRequest request) {
    return store.replaceAvailability(request);
  }
}
