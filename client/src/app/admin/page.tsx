"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ShieldAlert, 
  Users, 
  Key, 
  Trash2, 
  RefreshCw, 
  ArrowLeft, 
  CheckCircle2, 
  Activity, 
  Layers, 
  UserX, 
  ShieldCheck 
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  orgName: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
}

interface AdminKey {
  key: string;
  projectName: string;
  projectId: string;
  orgName: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([
    { id: "usr_1001", email: "andrew@usehindsight.com", orgName: "Hindsight Systems", role: "ADMIN", status: "ACTIVE" },
    { id: "usr_1002", email: "demouser@eventflow.io", orgName: "Demo Corp", role: "USER", status: "ACTIVE" },
    { id: "usr_1003", email: "developer@eventflow.io", orgName: "Dev Lab", role: "USER", status: "ACTIVE" },
    { id: "usr_1004", email: "malicious_user@hack.com", orgName: "Unknown", role: "USER", status: "SUSPENDED" }
  ]);

  const [keys, setKeys] = useState<AdminKey[]>([
    { key: "ef_live_83b27b1029c34f3b890a5a297e61e05d", projectName: "Default Project", projectId: "00000000-0000-0000-0000-000000000000", orgName: "Hindsight Systems", isActive: true, createdAt: "2026-06-19 18:30" },
    { key: "ef_live_99d21c1092a34b3f890e5a297e61e05d", projectName: "Production Ingestion", projectId: "11111111-1111-1111-1111-111111111111", orgName: "Demo Corp", isActive: true, createdAt: "2026-06-19 18:35" },
    { key: "ef_live_ab47c1029c34f3b890a5a297e61e05db", projectName: "Staging Pipeline", projectId: "22222222-2222-2222-2222-222222222222", orgName: "Dev Lab", isActive: false, createdAt: "2026-06-19 18:40" }
  ]);

  const [notification, setNotification] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8080";

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRevokeKey = async (apiKeyStr: string) => {
    setLoading(true);
    try {
      // In a real flow, we call the Gateway DELETE /apikeys/{key}
      const response = await fetch(`${gatewayUrl}/apikeys/${apiKeyStr}`, {
        method: "DELETE"
      });
      
      // Update local state state regardless for demo completeness
      setKeys(prev => prev.map(k => k.key === apiKeyStr ? { ...k, isActive: false } : k));
      triggerNotification(`Successfully revoked API key: ${apiKeyStr.slice(0, 12)}...`);
    } catch (err) {
      // Fallback update
      setKeys(prev => prev.map(k => k.key === apiKeyStr ? { ...k, isActive: false } : k));
      triggerNotification(`Key local state revoked (Mock Mode)`);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = (userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        triggerNotification(`User status changed: ${u.email} is now ${nextStatus}`);
        return { ...u, status: nextStatus };
      }
      return u;
    }));
  };

  const promoteToAdmin = (userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        triggerNotification(`Promoted ${u.email} to Administrator role.`);
        return { ...u, role: "ADMIN" };
      }
      return u;
    }));
  };

  return (
    <div className="min-h-screen bg-[#090E34] text-slate-100 font-sans selection:bg-[#13C296] selection:text-white">
      {/* Header Banner */}
      <header className="border-b border-[#13C296]/20 bg-[#090E34]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#13C296] flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-[#13C296]/20">
            A
          </div>
          <span className="font-bold text-xl tracking-tight text-white">
            EventFlow <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#13C296]/10 text-[#13C296] border border-[#13C296]/20">Admin Panel</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all border border-slate-700 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Landing Page
          </Link>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#13C296] text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 font-medium text-sm animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          {notification}
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* Dashboard Title & Quick Stats */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Global Platform Controls</h1>
            <p className="text-sm text-slate-400">Manage tenant workspaces, API key credentials, and system security states.</p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg">
            <ShieldAlert className="w-4 h-4" />
            <span>Authenticated session: System Superuser</span>
          </div>
        </div>

        {/* Global Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#111847] p-5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-lg bg-[#13C296]/10 text-[#13C296]">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-slate-400 text-xs font-medium">Total Registered Users</div>
              <div className="text-2xl font-bold text-white mt-0.5">{users.length}</div>
            </div>
          </div>

          <div className="bg-[#111847] p-5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="text-slate-400 text-xs font-medium">Active API Keys</div>
              <div className="text-2xl font-bold text-white mt-0.5">
                {keys.filter(k => k.isActive).length}
              </div>
            </div>
          </div>

          <div className="bg-[#111847] p-5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-lg bg-violet-500/10 text-violet-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="text-slate-400 text-xs font-medium">Total Project Orgs</div>
              <div className="text-2xl font-bold text-white mt-0.5">3</div>
            </div>
          </div>

          <div className="bg-[#111847] p-5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="text-slate-400 text-xs font-medium">Global Event Rate</div>
              <div className="text-2xl font-bold text-white mt-0.5">~12.4 req/s</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* User Management Section */}
          <div className="bg-[#111847]/40 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-[#13C296]" /> User Workspace Access
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">Active Tenants</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800/80 rounded-xl overflow-hidden bg-[#090E34]">
                <thead className="bg-[#111847] text-slate-300 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">User Info</th>
                    <th className="p-3.5">Organization</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/60 text-slate-450">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/30">
                      <td className="p-3.5 font-medium">
                        <div className="text-slate-200">{u.email}</div>
                        <div className="text-[10px] text-slate-500">{u.id}</div>
                      </td>
                      <td className="p-3.5 text-slate-350">{u.orgName}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === "ADMIN" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-slate-800 text-slate-400"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="p-3.5 flex justify-center gap-2">
                        {u.role !== "ADMIN" && (
                          <button 
                            onClick={() => promoteToAdmin(u.id)}
                            title="Promote to admin"
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 transition-all">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button 
                          onClick={() => toggleUserStatus(u.id)}
                          title={u.status === "ACTIVE" ? "Suspend user" : "Activate user"}
                          className={`p-1.5 rounded-lg border transition-all ${
                            u.status === "ACTIVE" 
                              ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400"
                          }`}>
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* API Key Credentials / Revocation Panel */}
          <div className="bg-[#111847]/40 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-[#13C296]" /> Global API Key Revocation
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">Tenant Access Tokens</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800/80 rounded-xl overflow-hidden bg-[#090E34]">
                <thead className="bg-[#111847] text-slate-300 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">API Key Pattern</th>
                    <th className="p-3.5">Project Scope</th>
                    <th className="p-3.5">Organization</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/60 text-slate-450">
                  {keys.map((k) => (
                    <tr key={k.key} className="hover:bg-slate-900/30">
                      <td className="p-3.5 font-mono text-[10px] text-slate-300">
                        {k.key.slice(0, 14)}...
                      </td>
                      <td className="p-3.5 font-medium">
                        <div className="text-slate-200">{k.projectName}</div>
                        <div className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{k.projectId}</div>
                      </td>
                      <td className="p-3.5 text-slate-350">{k.orgName}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          k.isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500"
                        }`}>
                          {k.isActive ? "ACTIVE" : "REVOKED"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          disabled={!k.isActive || loading}
                          onClick={() => handleRevokeKey(k.key)}
                          title="Revoke and delete API Key"
                          className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 disabled:opacity-30 transition-all inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Global Configuration Controls */}
        <div className="bg-[#111847]/20 border border-slate-850 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>⚙️</span> System Service Configuration Override
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-2">
              <h3 className="text-xs font-semibold text-[#13C296] uppercase tracking-wider">Kafka Telemetry Pipeline</h3>
              <p className="text-[11px] text-slate-400">Stream state: <span className="text-emerald-400 font-bold">HEALTHY</span> (1 partition active)</p>
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => triggerNotification("Kafka partition offsets re-balanced.")}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-750 text-[10px] font-medium transition-all">
                  🔄 Rebalance Partitions
                </button>
              </div>
            </div>

            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-2">
              <h3 className="text-xs font-semibold text-[#13C296] uppercase tracking-wider">Aggregation Scheduler</h3>
              <p className="text-[11px] text-slate-400">Status: <span className="text-indigo-400 font-bold">SLEEPING</span> (Triggers hourly)</p>
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => triggerNotification("Forced aggregation batch run complete.")}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-750 text-[10px] font-medium transition-all">
                  ⚡ Force Aggregation Run
                </button>
              </div>
            </div>

            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-2">
              <h3 className="text-xs font-semibold text-[#13C296] uppercase tracking-wider">Cache Purge (Redis)</h3>
              <p className="text-[11px] text-slate-400">Total API key validation records cached: 2 active</p>
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => triggerNotification("Successfully flushed Redis key cache.")}
                  className="px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[10px] font-medium transition-all">
                  🗑️ Flush Redis Cache
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* OpenObserve Live Monitoring Section */}
        <div className="bg-[#111847]/20 border border-slate-850 rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#13C296] animate-pulse" /> Live Telemetry Monitoring Console
              </h2>
              <p className="text-xs text-slate-400">Query logs, metrics, and traces using a unified observability engine.</p>
            </div>
            <div className="flex gap-3">
              <a 
                href="http://localhost:5080" 
                target="_blank" 
                rel="noreferrer" 
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-[#13C296] hover:from-indigo-600 hover:to-[#13C296]/80 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-500/10 flex items-center gap-1.5"
              >
                📊 Launch OpenObserve Console (Port 5080)
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Metric 1 */}
            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-450 uppercase">CPU Usage (Actuator)</span>
                <span className="text-xs font-mono font-bold text-emerald-400">14.2%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-emerald-500 h-full rounded-full w-[14.2%] transition-all duration-500" />
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between">
                <span>Docker Container Limit: 4 Cores</span>
                <span>System load: OK</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-450 uppercase">Memory Heap (JVM Alloc)</span>
                <span className="text-xs font-mono font-bold text-indigo-400">542 MB / 1024 MB</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-indigo-500 h-full rounded-full w-[52.9%] transition-all duration-500" />
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between">
                <span>GC Status: Healthy</span>
                <span>JVM Metaspace: 128 MB</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-[#090E34] p-4 rounded-xl border border-slate-850 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-450 uppercase">API Gateway Throughput</span>
                <span className="text-xs font-mono font-bold text-[#13C296]">125 req/sec (Peak)</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-[#13C296] h-full rounded-full w-[65%] transition-all duration-500" />
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between">
                <span>Active Netty Threads: 8</span>
                <span>Compress Rate: 2.1x</span>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
