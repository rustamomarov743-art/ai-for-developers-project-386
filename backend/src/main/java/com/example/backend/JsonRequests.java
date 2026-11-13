package com.example.backend;

import tools.jackson.databind.JsonNode;

final class JsonRequests {

  private JsonRequests() {}

  static boolean isPresent(JsonNode value) {
    return value != null && !value.isNull();
  }
}
