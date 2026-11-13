package com.example.backend;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
record Availability(
    boolean exists, String timeZone, Integer version, WeeklyTemplate weeklyTemplate) {

  static Availability absent() {
    return new Availability(false, null, null, null);
  }
}
