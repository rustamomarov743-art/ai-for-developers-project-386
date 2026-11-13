package com.example.backend;

import tools.jackson.databind.JsonNode;

record CreateMeetingTypeRequest(JsonNode name, JsonNode description, JsonNode durationMinutes) {}
