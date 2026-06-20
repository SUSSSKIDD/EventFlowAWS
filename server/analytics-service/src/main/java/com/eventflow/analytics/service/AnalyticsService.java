package com.eventflow.analytics.service;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.repository.AnalyticsEventRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import io.micrometer.core.instrument.MeterRegistry;

@Service
public class AnalyticsService {

    private final AnalyticsEventRepository eventRepository;
    private final MeterRegistry meterRegistry;

    @PersistenceContext
    private EntityManager entityManager;

    public AnalyticsService(AnalyticsEventRepository eventRepository, MeterRegistry meterRegistry) {
        this.eventRepository = eventRepository;
        this.meterRegistry = meterRegistry;
    }

    public List<String> getEventNames(UUID projectId) {
        return eventRepository.findDistinctEventNames(projectId);
    }

    public List<AnalyticsEvent> getEvents(UUID projectId, Instant start, Instant end) {
        return eventRepository.findByProjectIdAndTimestampBetween(projectId, start, end);
    }

    /**
     * Dynamically computes funnel conversion numbers.
     * steps: Ordered list of event names, e.g., ["signup", "view_product", "purchase"]
     * windowInDays: Time limit to complete the entire sequence from the first step.
     */
    public Map<String, Object> calculateFunnel(UUID projectId, List<String> steps, int windowInDays, Instant start, Instant end) {
        if (steps == null || steps.isEmpty()) {
            return Collections.emptyMap();
        }

        io.micrometer.core.instrument.Timer.Sample sample = io.micrometer.core.instrument.Timer.start(meterRegistry);

        Map<String, Object> response = new LinkedHashMap<>();
        List<Map<String, Object>> stepResults = new ArrayList<>();

        // We compute counts for prefix sub-lists of steps.
        // E.g., count for ["signup"], then count for ["signup", "view_product"], then ["signup", "view_product", "purchase"]
        for (int i = 1; i <= steps.size(); i++) {
            List<String> subSteps = steps.subList(0, i);
            long count = executeFunnelQuery(projectId, subSteps, windowInDays, start, end);
            
            Map<String, Object> stepData = new LinkedHashMap<>();
            String currentStepName = steps.get(i - 1);
            stepData.put("step", i);
            stepData.put("eventName", currentStepName);
            stepData.put("count", count);

            double conversionRate = 100.0;
            if (i > 1 && !stepResults.isEmpty()) {
                long prevCount = (Long) stepResults.get(i - 2).get("count");
                conversionRate = prevCount == 0 ? 0.0 : ((double) count / prevCount) * 100.0;
            }
            stepData.put("conversionRate", conversionRate);
            stepResults.add(stepData);
        }

        response.put("projectId", projectId);
        response.put("steps", stepResults);
        response.put("windowInDays", windowInDays);

        sample.stop(meterRegistry.timer("funnel.query.duration.ms"));

        return response;
    }

    private long executeFunnelQuery(UUID projectId, List<String> steps, int windowInDays, Instant start, Instant end) {
        if (steps.isEmpty()) return 0;

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT COUNT(DISTINCT s1.user_id) FROM events s1 ");

        for (int i = 2; i <= steps.size(); i++) {
            String alias = "s" + i;
            String prevAlias = "s" + (i - 1);
            sql.append("JOIN events ").append(alias).append(" ON s1.user_id = ").append(alias).append(".user_id ")
               .append("AND ").append(alias).append(".event_name = :step").append(i).append(" ")
               .append("AND ").append(alias).append(".timestamp > ").append(prevAlias).append(".timestamp ")
               .append("AND ").append(alias).append(".timestamp < s1.timestamp + INTERVAL '").append(windowInDays).append(" days' ");
        }

        sql.append("WHERE s1.project_id = :projectId AND s1.event_name = :step1 ")
           .append("AND s1.timestamp BETWEEN :start AND :end");

        Query query = entityManager.createNativeQuery(sql.toString());
        query.setParameter("projectId", projectId);
        query.setParameter("step1", steps.get(0));
        query.setParameter("start", Date.from(start));
        query.setParameter("end", Date.from(end));

        for (int i = 2; i <= steps.size(); i++) {
            query.setParameter("step" + i, steps.get(i - 1));
        }

        return ((Number) query.getSingleResult()).longValue();
    }

    /**
     * Simple cohort-based weekly retention calculator.
     * Cohort is defined by users who performed firstEvent (e.g. signup) on Week 0,
     * and how many returned to perform secondEvent (e.g. login) in subsequent weeks.
     */
    public Map<String, Object> calculateRetention(UUID projectId, String cohortEvent, String returnEvent, Instant start, Instant end) {
        // Query users in the cohort starting period
        String cohortQueryStr = "SELECT DISTINCT user_id, timestamp FROM events " +
                "WHERE project_id = :projectId AND event_name = :cohortEvent AND timestamp BETWEEN :start AND :end";
        
        Query cohortQuery = entityManager.createNativeQuery(cohortQueryStr);
        cohortQuery.setParameter("projectId", projectId);
        cohortQuery.setParameter("cohortEvent", cohortEvent);
        cohortQuery.setParameter("start", Date.from(start));
        cohortQuery.setParameter("end", Date.from(end));

        @SuppressWarnings("unchecked")
        List<Object[]> cohortUsers = cohortQuery.getResultList();
        
        Map<String, Instant> userCohortMap = new HashMap<>();
        for (Object[] row : cohortUsers) {
            String userId = (String) row[0];
            Instant ts = ((java.sql.Timestamp) row[1]).toInstant();
            // Store the earliest cohort date for each user
            userCohortMap.merge(userId, ts, (oldVal, newVal) -> newVal.isBefore(oldVal) ? newVal : oldVal);
        }

        int totalCohortSize = userCohortMap.size();
        int[] weeklyCounts = new int[5]; // track 4 weeks after cohort definition week

        if (totalCohortSize > 0) {
            // Find all return events for users in this cohort
            String returnQueryStr = "SELECT user_id, timestamp FROM events " +
                    "WHERE project_id = :projectId AND event_name = :returnEvent AND user_id IN (:userIds)";
            
            Query returnQuery = entityManager.createNativeQuery(returnQueryStr);
            returnQuery.setParameter("projectId", projectId);
            returnQuery.setParameter("returnEvent", returnEvent);
            returnQuery.setParameter("userIds", userCohortMap.keySet());

            @SuppressWarnings("unchecked")
            List<Object[]> returnEvents = returnQuery.getResultList();

            // Track which weeks users returned
            Map<String, Set<Integer>> userReturnWeeks = new HashMap<>();

            for (Object[] row : returnEvents) {
                String userId = (String) row[0];
                Instant returnTs = ((java.sql.Timestamp) row[1]).toInstant();
                Instant cohortTs = userCohortMap.get(userId);

                if (cohortTs != null && returnTs.isAfter(cohortTs)) {
                    long daysDiff = ChronoUnit.DAYS.between(cohortTs, returnTs);
                    int week = (int) (daysDiff / 7);
                    if (week >= 0 && week < 5) {
                        userReturnWeeks.computeIfAbsent(userId, k -> new HashSet<>()).add(week);
                    }
                }
            }

            // Count weekly returning users
            for (Set<Integer> weeks : userReturnWeeks.values()) {
                for (int w : weeks) {
                    weeklyCounts[w]++;
                }
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("cohortSize", totalCohortSize);
        List<Map<String, Object>> cohortWeeks = new ArrayList<>();
        for (int w = 0; w < weeklyCounts.length; w++) {
            Map<String, Object> weekData = new LinkedHashMap<>();
            weekData.put("week", w);
            weekData.put("count", weeklyCounts[w]);
            weekData.put("percentage", totalCohortSize == 0 ? 0.0 : ((double) weeklyCounts[w] / totalCohortSize) * 100.0);
            cohortWeeks.add(weekData);
        }
        response.put("retentionWeeks", cohortWeeks);
        return response;
    }
}
