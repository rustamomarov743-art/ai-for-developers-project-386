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
