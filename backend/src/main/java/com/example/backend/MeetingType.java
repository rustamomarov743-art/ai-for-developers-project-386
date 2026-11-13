package com.example.backend;

import java.time.Instant;

record MeetingType(
    String id, String name, String description, int durationMinutes, Instant createdAt) {}
