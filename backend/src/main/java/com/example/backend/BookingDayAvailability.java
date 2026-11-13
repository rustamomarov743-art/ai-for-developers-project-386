package com.example.backend;

import java.time.LocalDate;
import java.util.List;

record BookingDayAvailability(
    LocalDate date,
    boolean hasAvailableSlots,
    List<BookingSlot> slots,
    List<BusyInterval> busyIntervals) {}
