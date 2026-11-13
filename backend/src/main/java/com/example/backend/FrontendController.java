package com.example.backend;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class FrontendController {

  @GetMapping({"/", "/owner/**", "/book"})
  String frontend() {
    return "forward:/index.html";
  }
}
