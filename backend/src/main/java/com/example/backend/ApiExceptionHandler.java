package com.example.backend;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class ApiExceptionHandler {

  @ExceptionHandler(RequestValidationException.class)
  ResponseEntity<ProblemDetails> handleValidation(
      RequestValidationException exception, HttpServletRequest request) {
    return problem(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Проверьте значения полей",
        request,
        exception.errors());
  }

  @ExceptionHandler({MalformedRequestException.class, HttpMessageNotReadableException.class})
  ResponseEntity<ProblemDetails> handleMalformedRequest(HttpServletRequest request) {
    return problem(
        HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "Некорректное тело запроса", request, null);
  }

  @ExceptionHandler(MeetingTypeNameConflictException.class)
  ResponseEntity<ProblemDetails> handleNameConflict(HttpServletRequest request) {
    return problem(
        HttpStatus.CONFLICT,
        "MEETING_TYPE_NAME_CONFLICT",
        "Тип встречи с таким названием уже существует",
        request,
        java.util.List.of(new ApiFieldError("name", "Название должно быть уникальным")));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ProblemDetails> handleUnexpectedError(HttpServletRequest request) {
    return problem(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Внутренняя ошибка сервера",
        request,
        null);
  }

  private ResponseEntity<ProblemDetails> problem(
      HttpStatus status,
      String code,
      String detail,
      HttpServletRequest request,
      java.util.List<ApiFieldError> errors) {
    var body =
        new ProblemDetails(
            "about:blank",
            status.getReasonPhrase(),
            status.value(),
            detail,
            request.getRequestURI(),
            code,
            errors);
    return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(body);
  }
}
