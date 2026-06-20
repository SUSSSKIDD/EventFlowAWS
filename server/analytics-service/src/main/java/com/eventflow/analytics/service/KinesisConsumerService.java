package com.eventflow.analytics.service;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.repository.AnalyticsEventRepository;
import com.eventflow.analytics.spi.EventEnricher;
import com.eventflow.proto.AnalyticsEventProto;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.kinesis.KinesisClient;
import software.amazon.awssdk.services.kinesis.model.*;
import software.amazon.awssdk.services.kinesis.model.Record;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import io.micrometer.core.instrument.MeterRegistry;

@Service
@Slf4j
public class KinesisConsumerService {

    private final AnalyticsEventRepository eventRepository;
    private final ObjectMapper objectMapper;
    private final List<EventEnricher> enrichers;
    private final MeterRegistry meterRegistry;
    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.kinesis.stream-name}")
    private String streamName;

    @Value("${spring.kinesis.endpoint}")
    private String endpoint;

    @Value("${spring.kinesis.region}")
    private String region;

    private KinesisClient kinesisClient;
    private ExecutorService executorService;
    private volatile boolean running = true;

    public KinesisConsumerService(AnalyticsEventRepository eventRepository, ObjectMapper objectMapper, MeterRegistry meterRegistry, JdbcTemplate jdbcTemplate) {
        this.eventRepository = eventRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.jdbcTemplate = jdbcTemplate;

        // Pre-load SPI enrichers
        this.enrichers = new ArrayList<>();
        ServiceLoader<EventEnricher> loader = ServiceLoader.load(EventEnricher.class);
        for (EventEnricher enricher : loader) {
            log.info("Discovered and registered SPI Enricher: {}", enricher.getClass().getName());
            this.enrichers.add(enricher);
        }
    }

    @PostConstruct
    public void init() {
        log.info("Initializing Kinesis Client pointing to {} in region {}", endpoint, region);
        this.kinesisClient = KinesisClient.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("mock-key", "mock-secret")
                ))
                .build();

        this.executorService = Executors.newSingleThreadExecutor();
        this.executorService.submit(this::pollKinesisStream);
    }

    private void pollKinesisStream() {
        log.info("Starting Kinesis polling loop for stream: {}", streamName);
        
        // Wait for stream to become active
        boolean streamReady = false;
        while (running && !streamReady) {
            try {
                DescribeStreamRequest describeStreamRequest = DescribeStreamRequest.builder()
                        .streamName(streamName)
                        .build();
                DescribeStreamResponse describeStreamResponse = kinesisClient.describeStream(describeStreamRequest);
                StreamStatus status = describeStreamResponse.streamDescription().streamStatus();
                if (status == StreamStatus.ACTIVE) {
                    streamReady = true;
                } else {
                    log.info("Stream status is {}, waiting...", status);
                    Thread.sleep(2000);
                }
            } catch (Exception e) {
                log.warn("Stream '{}' not ready yet, retrying in 2 seconds...", streamName);
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }

        List<String> shardIds = new ArrayList<>();
        try {
            ListShardsRequest listShardsRequest = ListShardsRequest.builder()
                    .streamName(streamName)
                    .build();
            ListShardsResponse listShardsResponse = kinesisClient.listShards(listShardsRequest);
            for (Shard shard : listShardsResponse.shards()) {
                shardIds.add(shard.shardId());
            }
        } catch (Exception e) {
            log.error("Failed to list shards for stream: {}", streamName, e);
            return;
        }

        log.info("Found {} shards to poll: {}", shardIds.size(), shardIds);

        // For each shard, get the initial shard iterator
        List<String> shardIterators = new ArrayList<>();
        for (String shardId : shardIds) {
            try {
                GetShardIteratorRequest getShardIteratorRequest = GetShardIteratorRequest.builder()
                        .streamName(streamName)
                        .shardId(shardId)
                        .shardIteratorType(ShardIteratorType.TRIM_HORIZON)
                        .build();
                GetShardIteratorResponse getShardIteratorResponse = kinesisClient.getShardIterator(getShardIteratorRequest);
                shardIterators.add(getShardIteratorResponse.shardIterator());
            } catch (Exception e) {
                log.error("Failed to get shard iterator for shard: {}", shardId, e);
            }
        }

        while (running) {
            boolean recordsFoundInLoop = false;
            for (int i = 0; i < shardIterators.size(); i++) {
                String iterator = shardIterators.get(i);
                if (iterator == null) continue;

                try {
                    GetRecordsRequest getRecordsRequest = GetRecordsRequest.builder()
                            .shardIterator(iterator)
                            .limit(100)
                            .build();
                    GetRecordsResponse getRecordsResponse = kinesisClient.getRecords(getRecordsRequest);
                    
                    List<Record> records = getRecordsResponse.records();
                    if (!records.isEmpty()) {
                        recordsFoundInLoop = true;
                        log.info("Polled {} records from shard index {}", records.size(), i);
                        List<AnalyticsEvent> eventsToSave = new ArrayList<>();
                        for (Record record : records) {
                            AnalyticsEvent event = processRecord(record);
                            if (event != null) {
                                eventsToSave.add(event);
                            }
                        }
                        if (!eventsToSave.isEmpty()) {
                            saveEventsBatch(eventsToSave);
                            log.info("Successfully batch saved {} events to database", eventsToSave.size());
                        }
                    }
                    // Update iterator for the next request
                    shardIterators.set(i, getRecordsResponse.nextShardIterator());
                } catch (ExpiredIteratorException e) {
                    log.warn("Shard iterator expired, renewing...");
                    try {
                        GetShardIteratorRequest getShardIteratorRequest = GetShardIteratorRequest.builder()
                                .streamName(streamName)
                                .shardId(shardIds.get(i))
                                .shardIteratorType(ShardIteratorType.LATEST)
                                .build();
                        GetShardIteratorResponse getShardIteratorResponse = kinesisClient.getShardIterator(getShardIteratorRequest);
                        shardIterators.set(i, getShardIteratorResponse.shardIterator());
                    } catch (Exception ex) {
                        log.error("Failed to renew shard iterator", ex);
                    }
                } catch (Exception e) {
                    log.error("Error fetching records from shard index {}", i, e);
                }
            }

            try {
                if (!recordsFoundInLoop) {
                    Thread.sleep(500);
                } else {
                    Thread.sleep(100);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void saveEventsBatch(List<AnalyticsEvent> events) {
        String sql = "INSERT INTO events (event_id, project_id, user_id, event_name, properties, timestamp, ip_address, country, city, user_agent, device_type, os, browser) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT (event_id) DO NOTHING";
        
        jdbcTemplate.batchUpdate(sql, new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
            @Override
            public void setValues(java.sql.PreparedStatement ps, int i) throws java.sql.SQLException {
                AnalyticsEvent event = events.get(i);
                ps.setObject(1, event.getEventId());
                ps.setObject(2, event.getProjectId());
                ps.setString(3, event.getUserId());
                ps.setString(4, event.getEventName());
                
                String propertiesJson = "{}";
                try {
                    propertiesJson = objectMapper.writeValueAsString(event.getProperties());
                } catch (Exception e) {
                    log.error("Failed to serialize properties", e);
                }
                ps.setString(5, propertiesJson);
                
                ps.setTimestamp(6, java.sql.Timestamp.from(event.getTimestamp()));
                ps.setString(7, event.getIpAddress());
                ps.setString(8, event.getCountry());
                ps.setString(9, event.getCity());
                ps.setString(10, event.getUserAgent());
                ps.setString(11, event.getDeviceType());
                ps.setString(12, event.getOs());
                ps.setString(13, event.getBrowser());
            }

            @Override
            public int getBatchSize() {
                return events.size();
            }
        });
    }

    private AnalyticsEvent processRecord(Record record) {
        long startTime = System.currentTimeMillis();
        byte[] payloadBytes = record.data().asByteArray();
        log.info("Received raw event from Kinesis. Sequence={}", record.sequenceNumber());

        try {
            AnalyticsEventProto protoEvent = AnalyticsEventProto.parseFrom(payloadBytes);

            Map<String, Object> properties = objectMapper.readValue(protoEvent.getPropertiesJson(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

            AnalyticsEvent event = AnalyticsEvent.builder()
                    .eventId(UUID.fromString(protoEvent.getEventId()))
                    .projectId(UUID.fromString(protoEvent.getProjectId()))
                    .userId(protoEvent.getUserId())
                    .eventName(protoEvent.getEventName())
                    .properties(properties)
                    .timestamp(Instant.ofEpochMilli(protoEvent.getTimestampMillis()))
                    .build();

            for (EventEnricher enricher : enrichers) {
                long start = System.currentTimeMillis();
                event = enricher.enrich(event);
                long duration = System.currentTimeMillis() - start;

                // Track enricher latency per plugin
                meterRegistry.timer("enricher.duration.ms", "plugin", enricher.getClass().getSimpleName())
                             .record(duration, java.util.concurrent.TimeUnit.MILLISECONDS);
            }

            long totalDuration = System.currentTimeMillis() - startTime;
            meterRegistry.timer("kinesis.consumer.lag").record(totalDuration, java.util.concurrent.TimeUnit.MILLISECONDS);
            log.info("Successfully processed event {}", event.getEventId());
            return event;

        } catch (Exception e) {
            log.error("Failed to process record seq: {}.", record.sequenceNumber(), e);
            meterRegistry.counter("dead.letter.event.count").increment();
            return null;
        }
    }

    @PreDestroy
    public void cleanup() {
        log.info("Shutting down Kinesis polling consumer...");
        this.running = false;
        if (this.executorService != null) {
            this.executorService.shutdownNow();
        }
        if (this.kinesisClient != null) {
            this.kinesisClient.close();
        }
    }
}
