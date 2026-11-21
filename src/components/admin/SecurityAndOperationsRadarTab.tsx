"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Activity,
  Database,
  Lock,
  Unlock,
  Radio,
  Server,
  Eye,
  Sliders,
  Check,
  X,
  FileText,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  OperationalAlertRecord,
  SecurityIncidentRecord,
  SecurityBlockedIpRecord,
  AlertSeverity,
} from "@/types";

interface SystemTelemetry {
  database: {
    status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
    latencyMs: number;
    sizeBytes: number;
    sizeMb: number;
    quotaMb: number;
    percentQuotaUsed: number;
    activePooler: boolean;
  };
  businesses: {
    total: number;
    active: number;
    verified: number;
    pilotsIntact: boolean;
    missingPilots: string[];
    quarantinedCount: number;
    pendingClaims: number;
  };
  payments: {
    activeProviders: number;
    bridgeDevicesEnrolled: number;
    bridgeDevicesOnline: number;
    unconfirmedReceipts: number;
    activePromotionsCount: number;
  };
  security: {
    blockedIpsCount: number;
    recentIncidentsCount: number;
    bruteForceAttempts24h: number;
  };
  meta: {
    evaluatedAt: string;
    engineVersion: string;
    isHealthy: boolean;
  };
}

export function SecurityAndOperationsRadarTab() {
  const [activeSubTab, setActiveSubTab] = useState<"ALERTS" | "GUARDS" | "HISTORY">("ALERTS");
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<OperationalAlertRecord[]>([]);
  const [resolvedAlerts, setResolvedAlerts] = useState<OperationalAlertRecord[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncidentRecord[]>([]);
  const [blockedIps, setBlockedIps] = useState<SecurityBlockedIpRecord[]>([]);
  const [guardStatus, setGuardStatus] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Resolution Modal State
  const [resolvingAlert, setResolvingAlert] = useState<OperationalAlertRecord | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Unblock IP Modal State
  const [unblockingIp, setUnblockingIp] = useState<string | null>(null);
  const [unblockReason, setUnblockReason] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const [alertsRes, securityRes] = await Promise.all([
        fetch("/api/admin/monitoring/alerts"),
        fetch("/api/admin/security/guards"),
      ]);

      const alertsData = await alertsRes.json();
      const securityData = await securityRes.json();

      if (alertsData.success) {
        setTelemetry(alertsData.telemetry);
        setActiveAlerts(alertsData.activeAlerts || []);
        setResolvedAlerts(alertsData.resolvedAlerts || []);
      }

      if (securityData.success) {
        setIncidents(securityData.incidents || []);
        setBlockedIps(securityData.blockedIps || []);
        setGuardStatus(securityData.guardStatus);
      }
    } catch (err: any) {
      console.error("Failed to load telemetry:", err);
      setStatusMsg({ type: "error", text: err.message || "Failed to load operations telemetry." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 45000); // 45-second live telemetry refresh
    return () => clearInterval(interval);
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/monitoring/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACKNOWLEDGE", alertId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to acknowledge alert." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Action failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvestigate = async (alertId: string) => {
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/monitoring/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INVESTIGATE", alertId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to update status." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Action failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmResolve = async () => {
    if (!resolvingAlert) return;
    if (!resolutionNotes || resolutionNotes.trim().length < 6) {
      setStatusMsg({ type: "error", text: "Please enter a valid resolution note (min 6 characters)." });
      return;
    }

    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/monitoring/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESOLVE",
          alertId: resolvingAlert.id,
          notes: resolutionNotes.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        setResolvingAlert(null);
        setResolutionNotes("");
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to resolve alert." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Action failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmUnblock = async () => {
    if (!unblockingIp) return;
    if (!unblockReason || unblockReason.trim().length < 6) {
      setStatusMsg({ type: "error", text: "Please enter a valid reason for unblocking (min 6 characters)." });
      return;
    }

    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/security/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UNBLOCK_IP",
          ip: unblockingIp,
          reason: unblockReason.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        setUnblockingIp(null);
        setUnblockReason("");
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to unblock IP." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Action failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunSimulationProbe = async () => {
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/security/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SIMULATE_THREAT_PROBE" }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Probe failed." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Probe failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/monitoring/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TRIGGER_EVALUATION" }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: "success", text: data.message });
        await fetchData();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Evaluation failed." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Evaluation failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityBadge = (sev: AlertSeverity) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-rose-100 text-rose-800 border-rose-300 animate-pulse";
      case "HIGH":
        return "bg-amber-100 text-amber-900 border-amber-300";
      case "MEDIUM":
        return "bg-sky-100 text-sky-800 border-sky-300";
      case "LOW":
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER RIBBON: TELEMETRY & SYSTEM HEALTH */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-lg">
                  55 MOSA Operations Radar &amp; Autonomous Shield
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  24/7 LIVE
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Proactive operational warnings, storage capacity limits, database health, and autonomous digital security guards
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTriggerEvaluation}
              disabled={actionLoading || loading}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
              <span>Evaluate Health Now</span>
            </button>

            <button
              onClick={handleRunSimulationProbe}
              disabled={actionLoading || loading}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Test Defense Shield Probe</span>
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {statusMsg && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
              statusMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* TELEMETRY METRIC GRID */}
        {telemetry && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            {/* Metric 1: Database Capacity */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Database Storage</span>
                </span>
                <span className="text-emerald-700 font-mono font-black">{telemetry.database.percentQuotaUsed}%</span>
              </div>
              <div className="text-base font-black text-slate-900 font-mono">
                {telemetry.database.sizeMb} MB <span className="text-xs text-slate-400 font-normal">/ {telemetry.database.quotaMb} MB</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    telemetry.database.percentQuotaUsed > 80
                      ? "bg-rose-600"
                      : telemetry.database.percentQuotaUsed > 60
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                  }`}
                  style={{ width: `${Math.min(100, telemetry.database.percentQuotaUsed)}%` }}
                />
              </div>
            </div>

            {/* Metric 2: Foundation Pilot Enterprises */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pilot Enterprises</span>
                </span>
                <span className="text-emerald-700 text-[10px] font-black uppercase">
                  {telemetry.businesses.pilotsIntact ? "100% INTACT" : "DEGRADED"}
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                4 / 4 <span className="text-xs text-slate-400 font-normal">Active &amp; Verified</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {telemetry.businesses.active} active businesses platform-wide
              </div>
            </div>

            {/* Metric 3: Digital Security Guard */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Autonomous Shield</span>
                </span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  ENFORCING
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                {telemetry.security.blockedIpsCount} <span className="text-xs text-slate-400 font-normal">Quarantined IPs</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {telemetry.security.recentIncidentsCount} incidents analyzed (24h)
              </div>
            </div>

            {/* Metric 4: Infrastructure & Latency */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pooler Connection</span>
                </span>
                <span className="text-emerald-700 text-[10px] font-bold uppercase font-mono">
                  {telemetry.database.latencyMs}ms
                </span>
              </div>
              <div className="text-base font-black text-slate-900 truncate">
                Supabase EU-1 <span className="text-xs text-slate-400 font-normal">Port 6543</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {telemetry.payments.activeProviders} mobile payment channels active
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SUBTABS NAVIGATION */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab("ALERTS")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
            activeSubTab === "ALERTS"
              ? "border-emerald-600 text-emerald-800 bg-emerald-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Active Early Warnings</span>
          {activeAlerts.length > 0 && (
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-black ${
              activeAlerts.some((a) => a.severity === "CRITICAL")
                ? "bg-rose-100 text-rose-800 animate-pulse"
                : "bg-amber-100 text-amber-800"
            }`}>
              {activeAlerts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("GUARDS")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
            activeSubTab === "GUARDS"
              ? "border-emerald-600 text-emerald-800 bg-emerald-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Digital Security Guard</span>
          {blockedIps.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-white text-[10px] font-black">
              {blockedIps.length} blocked
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("HISTORY")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
            activeSubTab === "HISTORY"
              ? "border-emerald-600 text-emerald-800 bg-emerald-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Incident &amp; Resolution History</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px]">
            {resolvedAlerts.length}
          </span>
        </button>
      </div>

      {/* SUBTAB 1: ACTIVE OPERATIONAL ALERTS */}
      {activeSubTab === "ALERTS" && (
        <div className="space-y-4">
          {activeAlerts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-card space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-slate-900">All Operational Systems Normal</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Zero active critical or high alerts. Database storage is safely under threshold, all 4 foundation pilot enterprises are active and verified, and payment routes are fully operational.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-white rounded-3xl border p-6 shadow-card space-y-5 transition-all ${
                    alert.severity === "CRITICAL"
                      ? "border-rose-300 ring-2 ring-rose-100"
                      : alert.severity === "HIGH"
                      ? "border-amber-300"
                      : "border-slate-200"
                  }`}
                >
                  {/* Alert Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {alert.component}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {alert.code}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        alert.status === "ACKNOWLEDGED"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : alert.status === "INVESTIGATING"
                          ? "bg-sky-50 text-sky-800 border border-sky-200"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        Status: {alert.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(alert.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Title & Core Details */}
                  <div className="space-y-2">
                    <h4 className="font-black text-slate-900 text-base flex items-center gap-2">
                      <AlertTriangle className={`w-5 h-5 shrink-0 ${
                        alert.severity === "CRITICAL" ? "text-rose-600" : "text-amber-600"
                      }`} />
                      <span>{alert.title}</span>
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {alert.message}
                    </p>
                  </div>

                  {/* Structured 6-Field Early Warning Architecture */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 block text-[11px]">Potential Consequences:</span>
                      <p className="text-slate-600 leading-relaxed text-[11px]">{alert.consequences}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 block text-[11px]">Recommended Solution:</span>
                      <p className="text-slate-600 leading-relaxed text-[11px]">{alert.recommendedAction}</p>
                    </div>

                    <div className="space-y-1 md:col-span-2 pt-2 border-t border-slate-200/60">
                      <span className="font-black text-emerald-800 block text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Administrator Corrective Directive:</span>
                      </span>
                      <pre className="text-slate-700 font-sans text-[11px] whitespace-pre-wrap leading-relaxed pl-5 bg-white p-2.5 rounded-xl border border-slate-200">
                        {alert.directive}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <span className="font-bold text-slate-700 block text-[10px]">Urgency:</span>
                      <span className="font-semibold text-rose-700 text-[11px]">{alert.urgency}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="font-bold text-slate-700 block text-[10px]">Resolution Criteria:</span>
                      <span className="text-slate-600 text-[11px]">{alert.resolutionCriteria}</span>
                    </div>
                  </div>

                  {/* Acknowledgement Status Notice */}
                  {alert.status === "ACKNOWLEDGED" && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-medium">
                      🛡️ <strong>Acknowledged:</strong> An administrator has acknowledged this developing risk. The alert remains active in the Command Center until physical resolution criteria are met.
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 flex-wrap">
                    {alert.status === "ACTIVE" && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer disabled:opacity-50"
                      >
                        Acknowledge Alert
                      </button>
                    )}

                    {alert.status !== "INVESTIGATING" && (
                      <button
                        onClick={() => handleInvestigate(alert.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 cursor-pointer disabled:opacity-50"
                      >
                        Set to Investigating
                      </button>
                    )}

                    <button
                      onClick={() => setResolvingAlert(alert)}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
                    >
                      ✓ Mark Resolved with Justification
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: AUTONOMOUS DIGITAL SECURITY GUARD */}
      {activeSubTab === "GUARDS" && (
        <div className="space-y-6">
          {/* Autonomous Shield Status */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-white">24/7 Autonomous Security Shield Active</h4>
                  <p className="text-xs text-slate-400">
                    Continuous edge inspection for SQL injection, cross-site scripting, brute-force attempts, and credential stuffing
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400">
                  Shield Mode: ENFORCING
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div>
                <div className="text-slate-400 text-[10px]">Active Quarantined IPs</div>
                <div className="text-lg font-black text-white font-mono">{blockedIps.length}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Threats Neutralized (24h)</div>
                <div className="text-lg font-black text-emerald-400 font-mono">
                  {guardStatus?.threatsNeutralized || 0}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Brute-Force Detections</div>
                <div className="text-lg font-black text-amber-400 font-mono">
                  {telemetry?.security.bruteForceAttempts24h || 0}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Autonomous Guard Policy</div>
                <div className="text-lg font-black text-sky-400">ZERO DATA LOSS</div>
              </div>
            </div>
          </div>

          {/* QUARANTINED IP ADDRESSES */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-700" />
                <span>Quarantined IP Addresses ({blockedIps.length})</span>
              </h4>
            </div>

            {blockedIps.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-500 text-xs">
                No IP addresses are currently quarantined. All incoming traffic is within normal security tolerances.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">Reason for Quarantine</th>
                      <th className="p-3">Blocked Until</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blockedIps.map((b) => (
                      <tr key={b.ip} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-slate-900">{b.ip}</td>
                        <td className="p-3 text-slate-600">{b.reason}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {new Date(b.blockedUntil).toLocaleString()}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setUnblockingIp(b.ip);
                              setUnblockReason("");
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          >
                            Unblock IP
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RECENT SECURITY INCIDENTS */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-700" />
              <span>Recent Security Events &amp; Defense Interceptions ({incidents.length})</span>
            </h4>

            {incidents.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-500 text-xs">
                No recent security incidents logged.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Incident Type</th>
                      <th className="p-3">Client IP</th>
                      <th className="p-3">Threat Score</th>
                      <th className="p-3">Automated Defense</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {incidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(inc.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-800">
                            {inc.incidentType}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-800">{inc.clientIp || "Internal"}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inc.threatScore > 75 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {inc.threatScore} / 100
                          </span>
                        </td>
                        <td className="p-3 text-emerald-700 font-bold text-[11px]">
                          {inc.automatedDefenseApplied}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            {inc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: RESOLVED INCIDENTS & AUDIT HISTORY */}
      {activeSubTab === "HISTORY" && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card space-y-4">
          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Resolved Incidents &amp; Governance Audit History ({resolvedAlerts.length})</span>
          </h4>

          {resolvedAlerts.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-500 text-xs">
              No historical resolved incidents recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {resolvedAlerts.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                        RESOLVED
                      </span>
                      <span className="font-bold text-slate-900">{a.title}</span>
                      <span className="text-[10px] font-mono text-slate-400">({a.code})</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {a.resolvedAt ? new Date(a.resolvedAt).toLocaleString() : new Date(a.updatedAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-slate-600 text-[11px]">{a.message}</p>

                  {a.resolutionNotes && (
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-[11px] text-slate-700">
                      <strong>Resolution Notes:</strong> {a.resolutionNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: RESOLVE ALERT WITH AUDIT JUSTIFICATION */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-100 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Confirm Operational Resolution
              </h4>
              <button
                onClick={() => setResolvingAlert(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-900">{resolvingAlert.title}</div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
                <strong>Resolution Criteria:</strong> {resolvingAlert.resolutionCriteria}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Resolution Notes &amp; Audit Justification *
              </label>
              <textarea
                rows={3}
                required
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Explain the corrective action taken, evidence verified, and why this alert is safely resolved..."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:outline-emerald-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResolvingAlert(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmResolve}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
              >
                {actionLoading ? "Resolving..." : "Confirm & Resolve Alert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UNBLOCK IP WITH JUSTIFICATION */}
      {unblockingIp && (
        <div className="fixed inset-0 z-100 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Unblock Quarantined IP Address
              </h4>
              <button
                onClick={() => setUnblockingIp(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-slate-500">Target IP:</span>
              <div className="font-mono font-bold text-slate-900">{unblockingIp}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Lifting Quarantine *
              </label>
              <input
                type="text"
                required
                value={unblockReason}
                onChange={(e) => setUnblockReason(e.target.value)}
                placeholder="e.g. Verified legitimate partner with password typo"
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:outline-emerald-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUnblockingIp(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmUnblock}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white cursor-pointer shadow-xs disabled:opacity-50"
              >
                {actionLoading ? "Unblocking..." : "Confirm & Lift Quarantine"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
