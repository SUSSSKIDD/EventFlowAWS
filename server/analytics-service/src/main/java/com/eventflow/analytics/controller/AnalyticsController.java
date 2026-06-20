package com.eventflow.analytics.controller;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.service.AnalyticsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/names")
    public ResponseEntity<List<String>> getEventNames(@RequestHeader("X-Project-Id") String projectIdStr) {
        UUID projectId = UUID.fromString(projectIdStr);
        return ResponseEntity.ok(analyticsService.getEventNames(projectId));
    }

    @GetMapping("/events")
    public ResponseEntity<List<AnalyticsEvent>> getEvents(
            @RequestHeader("X-Project-Id") String projectIdStr,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        
        UUID projectId = UUID.fromString(projectIdStr);
        Instant start = from != null ? Instant.parse(from) : Instant.now().minus(30, java.time.temporal.ChronoUnit.DAYS);
        Instant end = to != null ? Instant.parse(to) : Instant.now();
        
        return ResponseEntity.ok(analyticsService.getEvents(projectId, start, end));
    }

    @GetMapping("/funnels")
    public ResponseEntity<Map<String, Object>> getFunnel(
            @RequestHeader("X-Project-Id") String projectIdStr,
            @RequestParam List<String> steps,
            @RequestParam(defaultValue = "7") int windowInDays,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        UUID projectId = UUID.fromString(projectIdStr);
        Instant start = from != null ? Instant.parse(from) : Instant.now().minus(30, java.time.temporal.ChronoUnit.DAYS);
        Instant end = to != null ? Instant.parse(to) : Instant.now();

        return ResponseEntity.ok(analyticsService.calculateFunnel(projectId, steps, windowInDays, start, end));
    }

    @GetMapping("/retention")
    public ResponseEntity<Map<String, Object>> getRetention(
            @RequestHeader("X-Project-Id") String projectIdStr,
            @RequestParam String cohortEvent,
            @RequestParam String returnEvent,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        UUID projectId = UUID.fromString(projectIdStr);
        Instant start = from != null ? Instant.parse(from) : Instant.now().minus(30, java.time.temporal.ChronoUnit.DAYS);
        Instant end = to != null ? Instant.parse(to) : Instant.now();

        return ResponseEntity.ok(analyticsService.calculateRetention(projectId, cohortEvent, returnEvent, start, end));
    }
}
