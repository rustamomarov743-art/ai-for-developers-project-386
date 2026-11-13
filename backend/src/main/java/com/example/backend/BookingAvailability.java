package com.example.backend;

import java.util.List;

record BookingAvailability(List<BookingDayAvailability> days) {
  boolean hasAvailableSlots() {
    return days.stream().anyMatch(BookingDayAvailability::hasAvailableSlots);
  }
}
