package com.example.backend;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
record Availability(
    boolean exists,
    String timeZone,
    Integer version,
    WeeklyTemplate weeklyTemplate,
    List<AvailabilityException> exceptions) {

  static Availability absent() {
    return new Availability(false, null, null, null, null);
  }
}
