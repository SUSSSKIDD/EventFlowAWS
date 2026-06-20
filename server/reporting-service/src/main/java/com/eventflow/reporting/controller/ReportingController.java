package com.eventflow.reporting.controller;

import com.eventflow.reporting.model.Report;
import com.eventflow.reporting.service.ReportingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/reports")
public class ReportingController {

    private final ReportingService reportingService;

    public ReportingController(ReportingService reportingService) {
        this.reportingService = reportingService;
    }

    @GetMapping
    public ResponseEntity<List<Report>> getReports(@RequestHeader("X-Project-Id") String projectIdStr) {
        UUID projectId = UUID.fromString(projectIdStr);
        return ResponseEntity.ok(reportingService.getReports(projectId));
    }

    @PostMapping("/generate")
    public ResponseEntity<Report> generateReport(
            @RequestHeader("X-Project-Id") String projectIdStr,
            @RequestParam String start,
            @RequestParam String end) {

        UUID projectId = UUID.fromString(projectIdStr);
        LocalDate startDate = LocalDate.parse(start);
        LocalDate endDate = LocalDate.parse(end);

        return ResponseEntity.ok(reportingService.generateReport(projectId, startDate, endDate));
    }
}
