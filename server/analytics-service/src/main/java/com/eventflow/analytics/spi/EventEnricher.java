package com.eventflow.analytics.spi;

import com.eventflow.analytics.model.AnalyticsEvent;

public interface EventEnricher {
    AnalyticsEvent enrich(AnalyticsEvent event);
}
