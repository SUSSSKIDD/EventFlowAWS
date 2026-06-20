package com.eventflow.auth.service;

import com.eventflow.auth.dto.*;
import com.eventflow.common.model.*;
import com.eventflow.auth.repository.*;
import com.eventflow.common.security.JwtUtil;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final ProjectRepository projectRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;

    public AuthService(UserRepository userRepository,
                       OrganizationRepository organizationRepository,
                       ProjectRepository projectRepository,
                       ApiKeyRepository apiKeyRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil,
                       StringRedisTemplate redisTemplate) {
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.projectRepository = projectRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.redisTemplate = redisTemplate;
    }

    @Transactional
    public User register(RegisterRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        Organization org = Organization.builder()
                .name(request.getOrgName() != null ? request.getOrgName() : "Default Organization")
                .build();
        org = organizationRepository.save(org);

        // Also create a default project for this org
        Project project = Project.builder()
                .name("Default Project")
                .organization(org)
                .build();
        projectRepository.save(project);

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .organization(org)
                .build();

        return userRepository.save(user);
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid credentials");
        }

        // Determine which project context to issue the token for
        String projectId = request.getProjectId();
        if (projectId == null || projectId.isEmpty()) {
            List<Project> projects = projectRepository.findByOrganizationId(user.getOrganization().getId());
            if (!projects.isEmpty()) {
                projectId = projects.get(0).getId().toString();
            } else {
                throw new RuntimeException("No project associated with organization");
            }
        }

        String token = jwtUtil.generateToken(user.getEmail(), projectId);
        return new AuthResponse(token, user.getEmail());
    }

    @Transactional
    public Project createProject(String name, String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Project project = Project.builder()
                .name(name)
                .organization(user.getOrganization())
                .build();

        return projectRepository.save(project);
    }

    public List<Project> getProjects(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return projectRepository.findByOrganizationId(user.getOrganization().getId());
    }

    @Transactional
    public ApiKey createApiKey(UUID projectId, String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));

        if (!project.getOrganization().getId().equals(user.getOrganization().getId())) {
            throw new SecurityException("Unauthorized access to project");
        }

        String generatedKey = "ef_live_" + UUID.randomUUID().toString().replace("-", "");

        ApiKey apiKey = ApiKey.builder()
                .apiKey(generatedKey)
                .project(project)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build();

        apiKey = apiKeyRepository.save(apiKey);

        // Cache in Redis: key: "apikey:{key}", value: projectId, TTL: 30 days
        redisTemplate.opsForValue().set(
                "apikey:" + generatedKey,
                project.getId().toString(),
                30,
                TimeUnit.DAYS
        );

        return apiKey;
    }

    @Transactional
    public void revokeApiKey(String key) {
        ApiKey apiKey = apiKeyRepository.findByApiKey(key)
                .orElseThrow(() -> new RuntimeException("API Key not found"));

        apiKey.setActive(false);
        apiKeyRepository.save(apiKey);

        // Revoke cache: DELETE from Redis
        redisTemplate.delete("apikey:" + key);
    }

    public List<ApiKey> getApiKeys(UUID projectId, String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));

        if (!project.getOrganization().getId().equals(user.getOrganization().getId())) {
            throw new SecurityException("Unauthorized access to project");
        }

        return apiKeyRepository.findByProjectId(projectId);
    }
}
