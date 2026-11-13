package com.example.backend;

import java.time.Instant;

record BookingSlot(Instant startsAt, Instant endsAt, BookingSlotStatus status) {}
