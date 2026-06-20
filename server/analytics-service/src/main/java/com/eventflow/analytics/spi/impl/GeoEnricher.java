package com.eventflow.analytics.spi.impl;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.spi.EventEnricher;

public class GeoEnricher implements EventEnricher {

    @Override
    public AnalyticsEvent enrich(AnalyticsEvent event) {
        // Retrieve IP from properties if not set on the entity
        String ip = event.getIpAddress();
        if (ip == null && event.getProperties() != null) {
            ip = (String) event.getProperties().get("ip");
        }

        if (ip == null || ip.isEmpty() || ip.equals("127.0.0.1") || ip.equals("0:0:0:0:0:0:0:1")) {
            event.setIpAddress("8.8.8.8"); // default fallback for testing
            event.setCountry("United States");
            event.setCity("Mountain View");
        } else {
            event.setIpAddress(ip);
            // Mock geo resolution based on IP patterns
            if (ip.startsWith("192.") || ip.startsWith("10.")) {
                event.setCountry("Local Network");
                event.setCity("Internal");
            } else {
                event.setCountry("India");
                event.setCity("Mumbai");
            }
        }
        return event;
    }
}
