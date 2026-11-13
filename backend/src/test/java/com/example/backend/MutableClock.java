package com.example.backend;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

class MutableClock extends Clock {

  private Instant instant;
  private final ZoneId zone;

  MutableClock(Instant instant, ZoneId zone) {
    this.instant = instant;
    this.zone = zone;
  }

  void setInstant(Instant instant) {
    this.instant = instant;
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return new MutableClock(instant, zone);
  }

  @Override
  public Instant instant() {
    return instant;
  }
}
