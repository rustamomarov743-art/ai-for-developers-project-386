package com.example.backend;

import java.util.List;

record WeeklyTemplate(
    List<TimeInterval> MONDAY,
    List<TimeInterval> TUESDAY,
    List<TimeInterval> WEDNESDAY,
    List<TimeInterval> THURSDAY,
    List<TimeInterval> FRIDAY,
    List<TimeInterval> SATURDAY,
    List<TimeInterval> SUNDAY) {}
