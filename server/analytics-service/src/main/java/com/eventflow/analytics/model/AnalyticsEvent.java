package com.eventflow.analytics.model;

import com.eventflow.common.model.MapToJsonConverter;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.domain.Persistable;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "events", indexes = {
    @Index(name = "idx_events_project_time", columnList = "project_id, timestamp DESC, event_name"),
    @Index(name = "idx_events_user_event_time", columnList = "user_id, event_name, timestamp")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString
public class AnalyticsEvent implements Persistable<UUID> {

    @Override
    public UUID getId() {
        return eventId;
    }

    @Override
    public boolean isNew() {
        return true;
    }

    @Id
    @Column(name = "event_id")
    private UUID eventId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "event_name", nullable = false)
    private String eventName;

    @Column(name = "properties", columnDefinition = "text")
    @Convert(converter = MapToJsonConverter.class)
    private Map<String, Object> properties;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    // Enriched fields
    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "country")
    private String country;

    @Column(name = "city")
    private String city;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "device_type")
    private String deviceType;

    @Column(name = "os")
    private String os;

    @Column(name = "browser")
    private String browser;
}
