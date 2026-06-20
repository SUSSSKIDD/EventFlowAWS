package com.eventflow.analytics.spi.impl;

import com.eventflow.analytics.model.AnalyticsEvent;
import com.eventflow.analytics.spi.EventEnricher;

public class DeviceEnricher implements EventEnricher {

    @Override
    public AnalyticsEvent enrich(AnalyticsEvent event) {
        String ua = event.getUserAgent();
        if (ua == null && event.getProperties() != null) {
            ua = (String) event.getProperties().get("userAgent");
        }

        if (ua == null || ua.isEmpty()) {
            event.setUserAgent("Unknown");
            event.setDeviceType("Desktop");
            event.setOs("Unknown");
            event.setBrowser("Unknown");
            return event;
        }

        event.setUserAgent(ua);

        // Simple user-agent parser logic
        String uaLower = ua.toLowerCase();
        
        // Browser detection
        if (uaLower.contains("chrome")) {
            event.setBrowser("Chrome");
        } else if (uaLower.contains("safari")) {
            event.setBrowser("Safari");
        } else if (uaLower.contains("firefox")) {
            event.setBrowser("Firefox");
        } else {
            event.setBrowser("Other");
        }

        // OS detection
        if (uaLower.contains("windows")) {
            event.setOs("Windows");
        } else if (uaLower.contains("macintosh") || uaLower.contains("mac os")) {
            event.setOs("macOS");
        } else if (uaLower.contains("android")) {
            event.setOs("Android");
        } else if (uaLower.contains("iphone") || uaLower.contains("ipad")) {
            event.setOs("iOS");
        } else if (uaLower.contains("linux")) {
            event.setOs("Linux");
        } else {
            event.setOs("Other");
        }

        // Device Type detection
        if (uaLower.contains("mobile") || uaLower.contains("iphone") || uaLower.contains("android")) {
            event.setDeviceType("Mobile");
        } else if (uaLower.contains("ipad") || uaLower.contains("tablet")) {
            event.setDeviceType("Tablet");
        } else {
            event.setDeviceType("Desktop");
        }

        return event;
    }
}
