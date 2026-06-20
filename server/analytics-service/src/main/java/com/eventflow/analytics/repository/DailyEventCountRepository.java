package com.eventflow.analytics.repository;

import com.eventflow.analytics.model.DailyEventCount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface DailyEventCountRepository extends JpaRepository<DailyEventCount, Long> {

    List<DailyEventCount> findByProjectIdAndEventDateBetween(UUID projectId, LocalDate start, LocalDate end);

    @Modifying
    @Transactional
    @Query(value = "INSERT INTO daily_event_counts (project_id, event_name, event_date, event_count) " +
            "VALUES (:projectId, :eventName, :eventDate, :count) " +
            "ON CONFLICT (project_id, event_name, event_date) " +
            "DO UPDATE SET event_count = EXCLUDED.event_count", nativeQuery = true)
    void upsertDailyCount(@Param("projectId") UUID projectId,
                          @Param("eventName") String eventName,
                          @Param("eventDate") LocalDate eventDate,
                          @Param("count") long count);
}
