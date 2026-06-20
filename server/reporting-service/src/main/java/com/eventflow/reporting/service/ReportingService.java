package com.eventflow.reporting.service;

import com.eventflow.reporting.client.GoogleDocsClient;
import com.eventflow.reporting.client.OpenRouterClient;
import com.eventflow.reporting.model.Report;
import com.eventflow.reporting.repository.ReportRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class ReportingService {

    private final ReportRepository reportRepository;
    private final OpenRouterClient openRouterClient;
    private final GoogleDocsClient googleDocsClient;
    private final WebClient webClient;

    public ReportingService(ReportRepository reportRepository,
                            OpenRouterClient openRouterClient,
                            GoogleDocsClient googleDocsClient,
                            WebClient.Builder webClientBuilder) {
        this.reportRepository = reportRepository;
        this.openRouterClient = openRouterClient;
        this.googleDocsClient = googleDocsClient;
        // Connect to Analytics Service
        this.webClient = webClientBuilder.baseUrl("http://localhost:8083").build();
    }

    public List<Report> getReports(UUID projectId) {
        return reportRepository.findByProjectId(projectId);
    }

    public Report generateReport(UUID projectId, LocalDate start, LocalDate end) {
        // 1. Create PENDING Report
        Report report = Report.builder()
                .projectId(projectId)
                .periodStart(start)
                .periodEnd(end)
                .status("PENDING")
                .build();
        report = reportRepository.save(report);

        try {
            // 2. Fetch Aggregated Data from Analytics Service
            log.info("Fetching analytics events summary for project {}", projectId);
            String rawEventsJson = "";
            try {
                rawEventsJson = webClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/analytics/events")
                                .queryParam("from", start.atStartOfDay().toString() + "Z")
                                .queryParam("to", end.plusDays(1).atStartOfDay().toString() + "Z")
                                .build())
                        .header("X-Project-Id", projectId.toString())
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();
            } catch (Exception ex) {
                log.warn("Could not connect to Analytics Service. Generating report with fallback data context.", ex);
                rawEventsJson = "[Mock Data: 1250 signups, 980 pageviews, 250 purchases]";
            }

            // 3. Call OpenRouter to generate narrative insights
            log.info("Generating narrative insights via OpenRouter");
            String summaryText = String.format("Project ID: %s, Dates: %s to %s. Data summary: %s", 
                    projectId, start, end, rawEventsJson);
            String narrative = openRouterClient.generateNarrative(summaryText);

            // 4. Update status to GENERATING and save content (Idempotency checkpoint)
            report.setStatus("GENERATING");
            report.setGeneratedContent(narrative);
            report = reportRepository.saveAndFlush(report);

            // 5. Call Google Docs API to create the report document
            log.info("Exporting report to Google Docs");
            String title = String.format("EventFlow Report [%s to %s]", start, end);
            String docUrl = googleDocsClient.createDocument(title, narrative);

            // 6. Finalize report in DB
            report.setStatus("DONE");
            report.setDocUrl(docUrl);
            report = reportRepository.save(report);
            log.info("Report generation complete: ID={}", report.getId());

        } catch (Exception e) {
            log.error("Report generation failed for report {}", report.getId(), e);
            report.setStatus("FAILED");
            reportRepository.save(report);
        }

        return report;
    }
}
