package com.example.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FrontendControllerTests {

  private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new FrontendController()).build();

  @ParameterizedTest
  @ValueSource(strings = {"/", "/owner", "/owner/availability", "/book"})
  void forwardsFrontendRoutesToIndex(String path) throws Exception {
    mockMvc.perform(get(path)).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
  }
}
