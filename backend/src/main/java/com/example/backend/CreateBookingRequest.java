package com.example.backend;

import tools.jackson.databind.JsonNode;

record CreateBookingRequest(
    JsonNode meetingTypeId, JsonNode startsAt, JsonNode guestName, JsonNode guestEmail) {}
