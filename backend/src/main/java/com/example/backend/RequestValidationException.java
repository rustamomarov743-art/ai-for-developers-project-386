package com.example.backend;

import java.util.List;

class RequestValidationException extends RuntimeException {

  private final List<ApiFieldError> errors;

  RequestValidationException(List<ApiFieldError> errors) {
    this.errors = List.copyOf(errors);
  }

  List<ApiFieldError> errors() {
    return errors;
  }
}
