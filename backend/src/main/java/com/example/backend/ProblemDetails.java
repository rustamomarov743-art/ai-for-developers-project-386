package com.example.backend;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

record ProblemDetails(
    String type,
    String title,
    int status,
    String detail,
    String instance,
    String code,
    @JsonInclude(JsonInclude.Include.NON_NULL) List<ApiFieldError> errors) {}
