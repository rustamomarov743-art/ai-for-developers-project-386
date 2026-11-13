import "@typespec/http";

using Http;

@service(#{ title: "Call Calendar API" })
@server("http://localhost:8080", "Local development")
namespace CallCalendar;

model HealthResponse {
  status: string;
}

@route("/api/health")
@get
op getHealth(): HealthResponse;

model MeetingType {
  id: string;
  name: string;
  description: string;
  durationMinutes: int32;
  createdAt: utcDateTime;
}

model CreateMeetingTypeRequest {
  @minLength(1)
  @maxLength(100)
  name: string;

  @minLength(1)
  @maxLength(1000)
  description: string;

  @minValue(1)
  @maxValue(1440)
  durationMinutes: int32;
}

model ApiFieldError {
  path: string;
  message: string;
}

model ProblemDetails {
  type: string;
  title: string;
  status: int32;
  detail: string;
  instance: string;
  code: string;
  errors?: ApiFieldError[];
}

model BadRequestResponse {
  @statusCode statusCode: 400;
  @header contentType: "application/problem+json";
  @body problem: ProblemDetails;
}

model ConflictResponse {
  @statusCode statusCode: 409;
  @header contentType: "application/problem+json";
  @body problem: ProblemDetails;
}

model InternalErrorResponse {
  @statusCode statusCode: 500;
  @header contentType: "application/problem+json";
  @body problem: ProblemDetails;
}

model CreateMeetingTypeResponse {
  @statusCode statusCode: 201;
  @body meetingType: MeetingType;
}

@route("/api/owner/meeting-types")
@get
op listMeetingTypes(): MeetingType[] | InternalErrorResponse;

@route("/api/owner/meeting-types")
@post
op createMeetingType(
  @body request: CreateMeetingTypeRequest,
): CreateMeetingTypeResponse | BadRequestResponse | ConflictResponse | InternalErrorResponse;

model TimeInterval {
  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  start: string;

  @pattern("^([01][0-9]|2[0-3]):[0-5][0-9]$")
  end: string;
}

model WeeklyTemplate {
  MONDAY: TimeInterval[];
  TUESDAY: TimeInterval[];
  WEDNESDAY: TimeInterval[];
  THURSDAY: TimeInterval[];
  FRIDAY: TimeInterval[];
  SATURDAY: TimeInterval[];
  SUNDAY: TimeInterval[];
}

enum AvailabilityExceptionType {
  CLOSED,
  CUSTOM,
}

model AvailabilityException {
  date: plainDate;
  type: AvailabilityExceptionType;
  intervals: TimeInterval[];
}

model Availability {
  exists: boolean;
  timeZone?: string;
  version?: int32;
  weeklyTemplate?: WeeklyTemplate;
  exceptions?: AvailabilityException[];
}

model ReplaceAvailabilityRequest {
  timeZone: string;
  expectedVersion: int32 | null;
  weeklyTemplate: WeeklyTemplate;
  exceptions: AvailabilityException[];
}

@route("/api/owner/availability")
@get
op getAvailability(): Availability | InternalErrorResponse;

@route("/api/owner/availability")
@put
op replaceAvailability(
  @body request: ReplaceAvailabilityRequest,
): Availability | BadRequestResponse | ConflictResponse | InternalErrorResponse;
