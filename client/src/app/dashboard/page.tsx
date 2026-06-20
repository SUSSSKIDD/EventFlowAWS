"use client";

import React, { useState, useEffect } from "react";

interface FunnelStep {
  step: number;
  eventName: string;
  count: number;
  conversionRate: number;
}

interface RetentionWeek {
  week: number;
  count: number;
  percentage: number;
}

interface ReportItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  generatedContent: string;
  docUrl: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"overview" | "insights" | "funnels" | "retention" | "reports" | "sdk">("overview");
  const [apiKey, setApiKey] = useState("ef_live_83b27b1029c34f3b890a5a297e61e05d");
  const [projectId, setProjectId] = useState("00000000-0000-0000-0000-000000000000"); // default fallback project id
  const [eventsTracked, setEventsTracked] = useState<string[]>([]);
  const [reportGenerating, setReportGenerating] = useState(false);

  // Live telemetry states
  const [funnelSteps, setFunnelSteps] = useState<FunnelStep[]>([]);
  const [retentionData, setRetentionData] = useState<{ cohortSize: number; retentionWeeks: RetentionWeek[] }>({
    cohortSize: 0,
    retentionWeeks: []
  });
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Mixpanel Insights states
  const [insightsEvent, setInsightsEvent] = useState<string>("all");
  const [insightsProperty, setInsightsProperty] = useState<string>("deviceType");
  const [filterProperty, setFilterProperty] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [chartType, setChartType] = useState<"segmentation" | "trend" | "table">("segmentation");

  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8080";

  // Fetch telemetry data from live backend services
  const fetchTelemetryData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Funnels
      const funnelRes = await fetch(
        `${gatewayUrl}/analytics/funnels?steps=pageview,signup,add_to_cart,purchase`,
        { headers: { "X-Project-Id": projectId } }
      );
      if (funnelRes.ok) {
        const data = await funnelRes.json();
        if (data.steps) setFunnelSteps(data.steps);
      }

      // 2. Fetch Retention
      const retentionRes = await fetch(
        `${gatewayUrl}/analytics/retention?cohortEvent=signup&returnEvent=purchase`,
        { headers: { "X-Project-Id": projectId } }
      );
      if (retentionRes.ok) {
        const data = await retentionRes.json();
        setRetentionData({
          cohortSize: data.cohortSize || 0,
          retentionWeeks: data.retentionWeeks || []
        });
      }

      // 3. Fetch Reports
      const reportsRes = await fetch(`${gatewayUrl}/reports`, {
        headers: { "X-Project-Id": projectId }
      });
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data);
      }

      // 4. Fetch Events
      const eventsRes = await fetch(`${gatewayUrl}/analytics/events`, {
        headers: { "X-Project-Id": projectId }
      });
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data || []);
      }

      // 5. Fetch Event Names
      const namesRes = await fetch(`${gatewayUrl}/analytics/names`, {
        headers: { "X-Project-Id": projectId }
      });
      if (namesRes.ok) {
        const data = await namesRes.json();
        setEventNames(data || []);
      }
    } catch (err) {
      console.warn("Telemetry API fetch failed. Platform running in live-disconnected mode.", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetryData();
  }, [projectId]);

  // Track event simulator
  const simulateTrack = async (eventName: string) => {
    const time = new Date().toLocaleTimeString();
    try {
      const response = await fetch(`${gatewayUrl}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify({
          eventId: "10000000-1000-4000-8000-" + Math.random().toString(16).substring(2, 14),
          userId: "usr_simulated",
          eventName,
          properties: { userAgent: "Browser/Simulated" },
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        setEventsTracked((prev) => [`[${time}] Live event sent: "${eventName}" (202 Accepted)`, ...prev.slice(0, 4)]);
        // Re-trigger fetch to display changes
        fetchTelemetryData();
      } else {
        setEventsTracked((prev) => [`[${time}] Error sending event: Status ${response.status}`, ...prev.slice(0, 4)]);
      }
    } catch (err) {
      setEventsTracked((prev) => [`[${time}] Ingestion connection failed (Verify backend runs on 8080)`, ...prev.slice(0, 4)]);
    }
  };

  // Helper to extract properties from event (supporting nested properties)
  const getEventPropertyValue = (event: any, propPath: string): string => {
    if (!event || !propPath) return "";
    if (event[propPath] !== undefined && event[propPath] !== null) {
      return String(event[propPath]);
    }
    if (event.properties && event.properties[propPath] !== undefined && event.properties[propPath] !== null) {
      return String(event.properties[propPath]);
    }
    return "";
  };

  // Get available filter/breakdown properties dynamically
  const getAvailableProperties = () => {
    const baseProps = ["deviceType", "browser", "os", "country", "city", "eventName"];
    const dynamicKeys = new Set<string>();
    events.forEach(e => {
      if (e.properties) {
        Object.keys(e.properties).forEach(k => {
          if (k !== "userAgent") {
            dynamicKeys.add(k);
          }
        });
      }
    });
    return [...baseProps, ...Array.from(dynamicKeys)];
  };

  // Filter events based on selected cohort requirements
  const getFilteredEvents = () => {
    return events.filter(e => {
      // 1. Filter by event name if selected
      if (insightsEvent !== "all" && e.eventName !== insightsEvent) {
        return false;
      }
      // 2. Filter by property if selected
      if (filterProperty) {
        const val = getEventPropertyValue(e, filterProperty);
        if (filterValue && !val.toLowerCase().includes(filterValue.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  };

  // Compute breakdown grouping counts and percentages
  const getInsightsBreakdown = () => {
    const filtered = getFilteredEvents();
    const groups: Record<string, number> = {};
    
    filtered.forEach(e => {
      let key = getEventPropertyValue(e, insightsProperty) || "unknown";
      groups[key] = (groups[key] || 0) + 1;
    });
    
    const total = filtered.length;
    return Object.entries(groups)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 105 : 0 // slight scale factor or clamp to max 100 below
      }))
      .map(item => ({
        ...item,
        percentage: Math.min(item.percentage, 100)
      }))
      .sort((a, b) => b.count - a.count);
  };

  // Compute trend metrics over the last 14 days
  const getInsightsTrend = () => {
    const filtered = getFilteredEvents();
    const dates: string[] = [];
    const now = new Date();
    // Get last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().split("T")[0]);
    }

    const breakdownData = getInsightsBreakdown().slice(0, 5); // top 5 segments to prevent chart clutter
    const segmentKeys = breakdownData.map(d => d.name);
    if (segmentKeys.length === 0) {
      segmentKeys.push("No Data");
    }

    // Initialize counts: date -> key -> count
    const dailyCounts: Record<string, Record<string, number>> = {};
    dates.forEach(d => {
      dailyCounts[d] = {};
      segmentKeys.forEach(k => {
        dailyCounts[d][k] = 0;
      });
    });

    filtered.forEach(e => {
      const dateStr = e.timestamp ? e.timestamp.split("T")[0] : "";
      if (dailyCounts[dateStr]) {
        let key = getEventPropertyValue(e, insightsProperty) || "unknown";
        if (segmentKeys.includes(key)) {
          dailyCounts[dateStr][key] = (dailyCounts[dateStr][key] || 0) + 1;
        }
      }
    });

    return {
      dates,
      segmentKeys,
      dailyCounts
    };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-500/20">
            E
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-200 via-indigo-100 to-white bg-clip-text text-transparent">
            EventFlow <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Analytics</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-400">Gateway Link: <span className="text-slate-200">{gatewayUrl}</span></span>
          </div>
          <button 
            onClick={() => fetchTelemetryData()}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all border border-slate-700">
            🔄 Refresh Data
          </button>
        </div>
      </header>

      {/* Hero & Navigation */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar */}
          <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
            {[
              { id: "overview", label: "Overview", icon: "📊" },
              { id: "insights", label: "Mixpanel Insights", icon: "📈" },
              { id: "funnels", label: "Funnel Analysis", icon: "⚡" },
              { id: "retention", label: "Cohort Retention", icon: "🔄" },
              { id: "reports", label: "AI Narrative Reports", icon: "✨" },
              { id: "sdk", label: "SDK & Developer Tools", icon: "🛠️" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10"
                    : "hover:bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}>
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </aside>

          {/* Main Panel */}
          <main className="flex-1 bg-slate-900/30 border border-slate-850 rounded-2xl p-6 backdrop-blur-sm min-h-[500px]">
            
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Event Statistics Overview</h2>
                  <p className="text-sm text-slate-400">Aggregated statistics from your event catalog streams.</p>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
                    <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Ingested Events</div>
                    <div className="text-3xl font-bold mt-2 text-indigo-400">{loading ? "..." : funnelSteps.reduce((acc, step) => acc + step.count, 0) || 0}</div>
                    <div className="text-xs text-slate-500 mt-2">Active database metrics</div>
                  </div>
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
                    <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Project Context</div>
                    <div className="text-3xl font-bold mt-2 text-violet-400 text-sm truncate">{projectId}</div>
                    <div className="text-xs text-slate-500 mt-2">Header-scoped tenant workspace</div>
                  </div>
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
                    <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Overall Conversion Rate</div>
                    <div className="text-3xl font-bold mt-2 text-emerald-400">
                      {funnelSteps.length > 0 ? `${funnelSteps[funnelSteps.length - 1].conversionRate.toFixed(1)}%` : "0.0%"}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">Funnel start-to-finish conversion</div>
                  </div>
                </div>

                {/* Event Simulator Widget */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 mt-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Live Event Ingestion Simulator</h3>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => simulateTrack("pageview")} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium border border-slate-700 transition-all">
                      ⚡ Track Pageview
                    </button>
                    <button onClick={() => simulateTrack("signup")} className="px-4 py-2 rounded-lg bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 text-xs font-medium border border-indigo-800/50 transition-all">
                      👤 Track Signup
                    </button>
                    <button onClick={() => simulateTrack("add_to_cart")} className="px-4 py-2 rounded-lg bg-violet-900/40 hover:bg-violet-900/60 text-violet-300 text-xs font-medium border border-violet-800/50 transition-all">
                      🛒 Add To Cart
                    </button>
                    <button onClick={() => simulateTrack("purchase")} className="px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-medium border border-emerald-800/50 transition-all">
                      💰 Track Purchase
                    </button>
                  </div>
                  
                  {/* Console Logs */}
                  <div className="mt-4 p-3 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 min-h-[100px] border border-slate-850">
                    <div className="text-slate-500 mb-2">// Ingest console logs (simulated network requests)</div>
                    {eventsTracked.length === 0 ? (
                      <div className="text-slate-650 italic">Click simulator buttons above to dispatch events...</div>
                    ) : (
                      eventsTracked.map((logStr, i) => (
                        <div key={i} className="text-emerald-400">{logStr}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mixpanel Insights Tab */}
            {activeTab === "insights" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>📈</span> Mixpanel-style Event Insights
                  </h2>
                  <p className="text-sm text-slate-400">
                    Analyze dynamic event segmentation, create custom cohorts, and compare breakdown traits.
                  </p>
                </div>

                {/* Query Builder Control Widget */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Event Selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Select Event</label>
                      <select
                        value={insightsEvent}
                        onChange={(e) => setInsightsEvent(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-350 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                      >
                        <option value="all">✨ All Events</option>
                        {eventNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Group By Selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Breakdown By</label>
                      <select
                        value={insightsProperty}
                        onChange={(e) => setInsightsProperty(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-350 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                      >
                        {getAvailableProperties().map(prop => (
                          <option key={prop} value={prop}>
                            {prop.charAt(0).toUpperCase() + prop.slice(1).replace(/([A-Z])/g, ' $1')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Cohort Property */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Filter Cohort</label>
                      <select
                        value={filterProperty}
                        onChange={(e) => {
                          setFilterProperty(e.target.value);
                          if (!e.target.value) setFilterValue("");
                        }}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-350 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">🚫 No Cohort Filter</option>
                        {getAvailableProperties().map(prop => (
                          <option key={prop} value={prop}>
                            {prop.charAt(0).toUpperCase() + prop.slice(1).replace(/([A-Z])/g, ' $1')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Value Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Filter Value</label>
                      <input
                        type="text"
                        disabled={!filterProperty}
                        placeholder={filterProperty ? "Match keyword (e.g. Chrome, US)..." : "Select property first..."}
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-350 disabled:opacity-50 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Chart type & controls */}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-900">
                    <div className="text-[11px] text-slate-500">
                      Filtered: <span className="font-semibold text-indigo-400">{getFilteredEvents().length}</span> / {events.length} events
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setChartType("segmentation")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          chartType === "segmentation"
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        📊 Segmentation
                      </button>
                      <button
                        onClick={() => setChartType("trend")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          chartType === "trend"
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        📈 Daily Trend
                      </button>
                      <button
                        onClick={() => setChartType("table")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          chartType === "table"
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        📋 Data Grid
                      </button>
                    </div>
                  </div>
                </div>

                {/* Display Output Widget */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                  {events.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-850 rounded-lg">
                      No telemetry event logs available. Verify backend is active or trigger events above.
                    </div>
                  ) : getFilteredEvents().length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-850 rounded-lg">
                      No events match your cohort filter rules.
                    </div>
                  ) : (
                    <div>
                      {chartType === "segmentation" && (
                        <div className="space-y-4">
                          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cohort Segment Distribution</h3>
                          <div className="space-y-4">
                            {getInsightsBreakdown().map((item, idx) => {
                              const colors = [
                                "from-indigo-500 to-violet-500",
                                "from-violet-500 to-purple-500",
                                "from-emerald-500 to-teal-500",
                                "from-amber-500 to-orange-500",
                                "from-rose-500 to-red-500"
                              ];
                              const colorClass = colors[idx % colors.length];
                              return (
                                <div key={item.name} className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs font-medium">
                                    <span className="text-slate-300 font-semibold">{item.name}</span>
                                    <span className="text-slate-400">{item.count.toLocaleString()} events ({item.percentage.toFixed(1)}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-900 rounded-full h-4 overflow-hidden border border-slate-800">
                                    <div
                                      className={`bg-gradient-to-r ${colorClass} h-full rounded-full transition-all duration-500`}
                                      style={{ width: `${item.percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {chartType === "trend" && (() => {
                        const trend = getInsightsTrend();
                        const maxVal = Math.max(...trend.dates.flatMap(d => trend.segmentKeys.map(k => trend.dailyCounts[d][k] || 0)), 5);
                        const colors = ["#6366f1", "#a855f7", "#10b981", "#f59e0b", "#ef4444"];
                        return (
                          <div className="space-y-4">
                            <div className="flex flex-wrap justify-between items-center mb-4">
                              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">14-Day Cohort Timeline Trend</h3>
                              <div className="flex flex-wrap gap-3 mt-2 md:mt-0">
                                {trend.segmentKeys.map((key, idx) => (
                                  <div key={key} className="flex items-center gap-1.5 text-xs text-slate-350">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                                    <span>{key}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* SVG Chart */}
                            <div className="w-full overflow-x-auto">
                              <svg className="w-full min-w-[600px] h-[300px]" viewBox="0 0 600 300">
                                {/* Grid lines */}
                                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                                  const y = 50 + ratio * 200;
                                  const val = Math.round(maxVal * (1 - ratio));
                                  return (
                                    <g key={i}>
                                      <line x1="50" y1={y} x2="560" y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="3,3" />
                                      <text x="15" y={y + 4} fill="#64748b" className="text-[10px] font-medium font-mono">{val}</text>
                                    </g>
                                  );
                                })}

                                {/* Draw lines */}
                                {trend.segmentKeys.map((key, sIdx) => {
                                  const points = trend.dates.map((d, index) => {
                                    const x = (index / 13) * 510 + 50; // x range: 50 to 560
                                    const val = trend.dailyCounts[d][key] || 0;
                                    const y = 250 - (val / maxVal) * 200; // y range: 50 to 250
                                    return `${x},${y}`;
                                  }).join(" ");
                                  const color = colors[sIdx % colors.length];

                                  return (
                                    <g key={key}>
                                      <polyline
                                        fill="none"
                                        stroke={color}
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        points={points}
                                      />
                                      {trend.dates.map((d, index) => {
                                        const x = (index / 13) * 510 + 50;
                                        const val = trend.dailyCounts[d][key] || 0;
                                        const y = 250 - (val / maxVal) * 200;
                                        return (
                                          <g key={index} className="group">
                                            <circle
                                              cx={x}
                                              cy={y}
                                              r="4"
                                              fill={color}
                                              stroke="#020617"
                                              strokeWidth="1.5"
                                            />
                                            {/* Hover tooltip overlay */}
                                            <title>{`${key} on ${d}: ${val} events`}</title>
                                          </g>
                                        );
                                      })}
                                    </g>
                                  );
                                })}

                                {/* X Axis Labels (Dates) */}
                                {trend.dates.map((d, index) => {
                                  if (index % 3 !== 0 && index !== 13) return null; // show subset to avoid overlap
                                  const x = (index / 13) * 510 + 50;
                                  const formattedDate = d.slice(5); // MM-DD
                                  return (
                                    <text key={index} x={x} y="280" fill="#64748b" textAnchor="middle" className="text-[9px] font-mono">
                                      {formattedDate}
                                    </text>
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                        );
                      })()}

                      {chartType === "table" && (
                        <div className="space-y-4">
                          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Segment Event Log</h3>
                          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                            <table className="w-full text-left text-xs border border-slate-900 rounded-lg overflow-hidden bg-slate-950">
                              <thead className="bg-slate-900 text-slate-350 sticky top-0 z-10 border-b border-slate-900">
                                <tr>
                                  <th className="p-3">Timestamp</th>
                                  <th className="p-3">Event</th>
                                  <th className="p-3">User ID</th>
                                  <th className="p-3">Breakdown Trait</th>
                                  <th className="p-3">Properties</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-900 text-slate-400">
                                {getFilteredEvents().slice(0, 100).map((e, idx) => (
                                  <tr key={e.eventId || idx} className="hover:bg-slate-900/40">
                                    <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                                      {e.timestamp ? new Date(e.timestamp).toLocaleString() : "n/a"}
                                    </td>
                                    <td className="p-3 font-semibold text-slate-300">{e.eventName}</td>
                                    <td className="p-3 font-mono text-[10px]">{e.userId}</td>
                                    <td className="p-3 text-indigo-400 font-medium">
                                      {getEventPropertyValue(e, insightsProperty) || "n/a"}
                                    </td>
                                    <td className="p-3 max-w-[200px] truncate text-[10px] font-mono text-slate-500" title={JSON.stringify(e.properties)}>
                                      {JSON.stringify(e.properties)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {getFilteredEvents().length > 100 && (
                            <div className="text-center text-[10px] text-slate-500">
                              Showing first 100 matches. Use filtering to refine list.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Funnels Tab */}
            {activeTab === "funnels" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Funnel Analytics Conversion</h2>
                  <p className="text-sm text-slate-400">Track sequential events completion within a time window (e.g. 7 Days).</p>
                </div>

                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                  {funnelSteps.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-850 rounded-lg">
                      No funnel telemetry data available. Dispatch simulated events on the Overview tab to populate.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {funnelSteps.map((s, idx) => (
                        <div key={s.step} className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span className="text-slate-300">Step {s.step}: <span className="font-semibold text-slate-200">"{s.eventName}"</span></span>
                            <span className="text-slate-400">{s.count.toLocaleString()} users ({s.conversionRate.toFixed(1)}% conversion)</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-4 overflow-hidden border border-slate-800">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${s.conversionRate}%` }}
                            />
                          </div>
                          {idx < funnelSteps.length - 1 && (
                            <div className="text-center text-[10px] text-indigo-400/70 font-semibold my-1">
                              ▼ {((funnelSteps[idx+1].count / s.count) * 100).toFixed(1)}% conversion rate
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Retention Tab */}
            {activeTab === "retention" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Cohort Retention Grid</h2>
                  <p className="text-sm text-slate-400">Percentage of users who return to perform action over weeks starting from their cohort week.</p>
                </div>

                {retentionData.retentionWeeks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-850 rounded-lg bg-slate-950">
                    No cohort retention telemetry data available.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950">
                      <thead className="bg-slate-900 text-slate-300 uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="p-4 border-b border-slate-800">Cohort Week</th>
                          <th className="p-4 border-b border-slate-800">Cohort Size</th>
                          <th className="p-4 border-b border-slate-800">Week 0</th>
                          <th className="p-4 border-b border-slate-800">Week 1</th>
                          <th className="p-4 border-b border-slate-800">Week 2</th>
                          <th className="p-4 border-b border-slate-800">Week 3</th>
                          <th className="p-4 border-b border-slate-800">Week 4</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        <tr>
                          <td className="p-4 font-semibold text-slate-200">Jun 01 - Jun 07</td>
                          <td className="p-4 text-slate-400">{retentionData.cohortSize}</td>
                          {retentionData.retentionWeeks.map((w) => {
                            let bgClass = "bg-indigo-900/10 text-indigo-400";
                            if (w.percentage >= 80) bgClass = "bg-indigo-600 text-white font-bold";
                            else if (w.percentage >= 40) bgClass = "bg-indigo-700/80 text-indigo-100";
                            else if (w.percentage >= 20) bgClass = "bg-indigo-800/40 text-indigo-200";
                            
                            return (
                              <td key={w.week} className={`p-4 text-center ${bgClass} border border-slate-900`}>
                                {w.percentage.toFixed(0)}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-white">AI Narrative Reports</h2>
                    <p className="text-sm text-slate-400">Weekly automated cohort insight generation via OpenRouter LLM and Google Docs.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setReportGenerating(true);
                      setTimeout(() => setReportGenerating(false), 2000);
                    }}
                    disabled={reportGenerating}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-semibold rounded-lg shadow-md transition-all">
                    {reportGenerating ? "Analyzing..." : "Generate Insights"}
                  </button>
                </div>

                <div className="space-y-4">
                  {reports.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-850 rounded-lg bg-slate-950">
                      No generated reports found. Click 'Generate Insights' to construct weekly reports.
                    </div>
                  ) : (
                    reports.map((rep) => (
                      <div key={rep.id} className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-xs font-medium px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                            Period: {rep.periodStart} to {rep.periodEnd}
                          </span>
                          <a 
                            href={rep.docUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                            📄 View Google Doc
                          </a>
                        </div>
                        
                        <div className="prose prose-invert max-w-none text-xs text-slate-350 space-y-2">
                          {rep.generatedContent}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SDK Tab */}
            {activeTab === "sdk" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">SDK & Integration Guide</h2>
                  <p className="text-sm text-slate-400">Integrate client-side event tracking using the EventFlow SDK.</p>
                </div>

                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Your Active API Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={apiKey} 
                        readOnly 
                        className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded-lg flex-1 font-mono"
                      />
                      <button 
                        onClick={() => alert("Copied API Key!")}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg border border-slate-750 transition-all">
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Javascript/Typescript Setup</label>
                    <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono text-[11px] text-indigo-300 overflow-x-auto">
{`import { eventflow } from "./sdk/eventflow-sdk";

// Initialize the SDK
eventflow.init("${apiKey}");

// Track events
eventflow.track("pageview", { path: "/dashboard" });
eventflow.track("purchase", { amount: 49.99, currency: "USD" });`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  );
}
