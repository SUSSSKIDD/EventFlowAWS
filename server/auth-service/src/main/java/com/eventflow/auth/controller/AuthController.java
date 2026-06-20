package com.eventflow.auth.controller;

import com.eventflow.auth.dto.*;
import com.eventflow.common.model.*;
import com.eventflow.auth.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/auth/register")
    public ResponseEntity<User> register(@RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/projects")
    public ResponseEntity<Project> createProject(@RequestParam String name) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(authService.createProject(name, email));
    }

    @GetMapping("/projects")
    public ResponseEntity<List<Project>> getProjects() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(authService.getProjects(email));
    }

    @PostMapping("/apikeys")
    public ResponseEntity<ApiKey> createApiKey(@RequestParam UUID projectId) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(authService.createApiKey(projectId, email));
    }

    @DeleteMapping("/apikeys/{key}")
    public ResponseEntity<Void> revokeApiKey(@PathVariable String key) {
        authService.revokeApiKey(key);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/apikeys")
    public ResponseEntity<List<ApiKey>> getApiKeys(@RequestParam UUID projectId) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(authService.getApiKeys(projectId, email));
    }
}
