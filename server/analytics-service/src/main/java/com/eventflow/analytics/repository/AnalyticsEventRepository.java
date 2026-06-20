package com.eventflow.analytics.repository;

import com.eventflow.analytics.model.AnalyticsEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AnalyticsEventRepository extends JpaRepository<AnalyticsEvent, UUID> {

    List<AnalyticsEvent> findByProjectIdAndTimestampBetween(UUID projectId, Instant start, Instant end);

    @Query("SELECT COUNT(e) FROM AnalyticsEvent e WHERE e.projectId = :projectId AND e.eventName = :eventName AND e.timestamp BETWEEN :start AND :end")
    long countEvents(@Param("projectId") UUID projectId,
                     @Param("eventName") String eventName,
                     @Param("start") Instant start,
                     @Param("end") Instant end);

    @Query("SELECT DISTINCT e.eventName FROM AnalyticsEvent e WHERE e.projectId = :projectId")
    List<String> findDistinctEventNames(@Param("projectId") UUID projectId);
}
