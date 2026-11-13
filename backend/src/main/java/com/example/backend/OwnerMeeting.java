package com.example.backend;

import java.time.Instant;

record OwnerMeeting(
    String id,
    String meetingTypeId,
    Instant startsAt,
    Instant endsAt,
    String guestName,
    String guestEmail,
    Instant createdAt,
    MeetingStatus status,
    MeetingType meetingType,
    int durationMinutes,
    boolean inProgress) {}
