package com.eventflow.analytics.spi.impl;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.spi.EventEnricher;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

public class PIIMasker implements EventEnricher {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}");
    private static final Pattern PHONE_PATTERN = Pattern.compile("(\\+\\d{1,3}[- ]?)?\\d{10}");

    @Override
    public AnalyticsEvent enrich(AnalyticsEvent event) {
        if (event.getProperties() == null || event.getProperties().isEmpty()) {
            return event;
        }

        Map<String, Object> sanitizedProperties = new HashMap<>(event.getProperties());
        boolean modified = false;

        for (Map.Entry<String, Object> entry : sanitizedProperties.entrySet()) {
            if (entry.getValue() instanceof String valStr) {
                String masked = maskPII(valStr);
                if (!masked.equals(valStr)) {
                    entry.setValue(masked);
                    modified = true;
                }
            }
        }

        if (modified) {
            event.setProperties(sanitizedProperties);
        }

        return event;
    }

    private String maskPII(String input) {
        // Redact email addresses
        String result = EMAIL_PATTERN.matcher(input).replaceAll("[REDACTED_EMAIL]");
        // Redact phone numbers
        result = PHONE_PATTERN.matcher(result).replaceAll("[REDACTED_PHONE]");
        return result;
    }
}
