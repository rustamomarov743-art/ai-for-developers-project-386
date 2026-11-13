package com.example.backend;

import tools.jackson.databind.JsonNode;

record ReplaceAvailabilityRequest(
    JsonNode timeZone, JsonNode expectedVersion, JsonNode weeklyTemplate, JsonNode exceptions) {}
