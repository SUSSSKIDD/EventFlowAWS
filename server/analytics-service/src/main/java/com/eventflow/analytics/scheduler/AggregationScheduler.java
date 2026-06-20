package com.eventflow.analytics.scheduler;

import com.eventflow.analytics.repository.DailyEventCountRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Component
@Slf4j
public class AggregationScheduler {

    @PersistenceContext
    private EntityManager entityManager;

    private final DailyEventCountRepository dailyEventCountRepository;

    public AggregationScheduler(DailyEventCountRepository dailyEventCountRepository) {
        this.dailyEventCountRepository = dailyEventCountRepository;
    }

    // Run every 1 minute for rapid updates in development, rather than 5 minutes.
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void aggregateEvents() {
        log.info("Starting scheduled event aggregation...");
        try {
            // Idempotent aggregates: SELECT count, project_id, event_name, DATE(timestamp)
            // Group and upsert into daily_event_counts.
            // We group by project_id, event_name, and the date of the event.
            String queryStr = "SELECT project_id, event_name, CAST(timestamp AS DATE) as event_date, COUNT(*) as event_count " +
                              "FROM events " +
                              "GROUP BY project_id, event_name, CAST(timestamp AS DATE)";

            @SuppressWarnings("unchecked")
            List<Object[]> results = entityManager.createNativeQuery(queryStr).getResultList();

            for (Object[] row : results) {
                UUID projectId = (UUID) row[0];
                String eventName = (String) row[1];
                // Handle different DB/Driver date representations
                LocalDate eventDate;
                if (row[2] instanceof Date sqlDate) {
                    eventDate = sqlDate.toLocalDate();
                } else if (row[2] instanceof java.util.Date utilDate) {
                    eventDate = new java.sql.Date(utilDate.getTime()).toLocalDate();
                } else {
                    eventDate = LocalDate.parse(row[2].toString());
                }
                long count = ((Number) row[3]).longValue();

                dailyEventCountRepository.upsertDailyCount(projectId, eventName, eventDate, count);
            }
            log.info("Event aggregation completed successfully. Aggregated {} groups.", results.size());
        } catch (Exception e) {
            log.error("Error running event aggregation scheduler", e);
        }
    }
}
