package com.example.backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class HealthController {

  @GetMapping("/api/health")
  HealthResponse health() {
    return new HealthResponse("UP");
  }

  record HealthResponse(String status) {}
}
