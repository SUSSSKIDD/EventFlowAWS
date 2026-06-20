package com.eventflow.auth.repository;

import com.eventflow.common.model.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {
    Optional<ApiKey> findByApiKey(String apiKey);
    List<ApiKey> findByProjectId(UUID projectId);
}
