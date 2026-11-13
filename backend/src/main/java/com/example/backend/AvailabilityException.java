package com.example.backend;

import java.time.LocalDate;
import java.util.List;

record AvailabilityException(
    LocalDate date, AvailabilityExceptionType type, List<TimeInterval> intervals) {}
