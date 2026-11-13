package com.example.backend;

import java.time.Instant;

record BusyInterval(Instant startsAt, Instant endsAt) {}
