package com.example.backend;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalTime;

record TimeInterval(
    @JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end) {

  static TimeInterval of(String start, String end) {
    return new TimeInterval(LocalTime.parse(start), LocalTime.parse(end));
  }
}
