"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  RefreshCw,
  Coins,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Send,
  CheckCircle2,
  Clock,
  Radio,
  Info,
  TrendingUp,
  Lock,
  ShieldAlert,
} from "lucide-react";

export type SweepStatus =
  | "CASHOUT_PENDING"
  | "CASHOUT_PROVIDER_CONFIRMED"
  | "WALLET_RECEIPT_MATCHED"
  | "RECONCILED"
  | "CASHOUT_FAILED"
  | "CASHOUT_REQUIRES_REVIEW";

interface TreasuryStats {
  clearedMerchantBalance: number;
  pendingCustomerPayments: number;
  totalCollectedRevenue: number;
  totalSweptToAirtel: number;
  totalPayoutFees: number;
  lastSweepAt: string | null;
  lastSweepRef: string | null;
  nextScheduledSweep: string;
  isThresholdReached: boolean;
  thresholdProgressPct: number;
  config: {
    threshold: number;
    destinationPhone: string;
    destinationName: string;
    autoSweepEnabled: boolean;
    scheduleTime: string;
    maxDailySweeps: number;
    minSweepAmount: number;
    sweepMode?: "FULL_BALANCE" | "EXACT_THRESHOLD";
    reserveAmount?: number;
  };
}

interface SweepHistoryRecord {
  id: string;
  sweepReference: string;
  idempotencyKey?: string;
  payoutRef: string | null;
  amount: number;
  fee: number;
  netAmount: number;
  destinationPhone: string;
  destinationProvider: string;
  status: SweepStatus;
  triggerType: "AUTOMATIC_THRESHOLD" | "AUTOMATIC_SCHEDULED" | "MANUAL_EMERGENCY";
  triggeredByName?: string | null;
  purpose?: string | null;
  clearedBalanceBefore: number;
  clearedBalanceAfter: number;
  failureReason?: string | null;
  smsBridgeEvidenceRef?: string | null;
  isFeeEstimated?: boolean;
  createdAt: string;
  settledAt?: string | null;
  isSimulation: boolean;
}

interface SweepPreview {
  clearedBalance: number;
  reserveAmount: number;
  sweepMode: "FULL_BALANCE" | "EXACT_THRESHOLD";
  sweepAmount: number;
  estimatedFee: number;
  isFeeEstimated: boolean;
  expectedNetPayout: number;
  destinationPhone: string;
  destinationName: string;
  isEligible: boolean;
  ineligibilityReason?: string;
}

interface PaypackTreasuryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaypackTreasuryModal({ isOpen, onClose }: PaypackTreasuryModalProps) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState<TreasuryStats | null>(null);
  const [history, setHistory] = useState<SweepHistoryRecord[]>([]);
  const [preview, setPreview] = useState<SweepPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Config Form
  const [thresholdInput, setThresholdInput] = useState<number>(50000);
  const [scheduleTimeInput, setScheduleTimeInput] = useState<string>("23:59");
  const [autoSweepInput, setAutoSweepInput] = useState<boolean>(false);
  const [sweepModeInput, setSweepModeInput] = useState<"FULL_BALANCE" | "EXACT_THRESHOLD">("FULL_BALANCE");
  const [reserveAmountInput, setReserveAmountInput] = useState<number>(0);

  // Emergency sweep confirmation & purpose
  const [showConfirmSweep, setShowConfirmSweep] = useState(false);
  const [emergencyPurpose, setEmergencyPurpose] = useState<string>("Emergency Treasury Payout to Airtel");

  useEffect(() => {
    if (isOpen) {
      fetchTreasuryData();
    }
  }, [isOpen]);

  const fetchTreasuryData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/payments/settlement");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setHistory(data.history || []);
        setPreview(data.preview || null);
        if (data.config) {
          setThresholdInput(data.config.threshold || 50000);
          setScheduleTimeInput(data.config.scheduleTime || "23:59");
          setAutoSweepInput(Boolean(data.config.autoSweepEnabled));
          setSweepModeInput(data.config.sweepMode === "EXACT_THRESHOLD" ? "EXACT_THRESHOLD" : "FULL_BALANCE");
          setReserveAmountInput(Number(data.config.reserveAmount || 0));
        }
      } else {
        setErrorMessage(data.error || "Failed to load settlement data.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error loading settlement data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/payments/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          threshold: Number(thresholdInput),
          scheduleTime: scheduleTimeInput,
          autoSweepEnabled: autoSweepInput,
          sweepMode: sweepModeInput,
          reserveAmount: Number(reserveAmountInput),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Settlement sweep rules updated successfully.");
        await fetchTreasuryData();
      } else {
        setErrorMessage(data.error || "Failed to update configuration.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update configuration.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerEmergencySweep = async () => {
    if (!emergencyPurpose || emergencyPurpose.trim().length < 5) {
      setErrorMessage("Please enter an administrative purpose (minimum 5 characters) for the emergency payout.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowConfirmSweep(false);
    try {
      const res = await fetch("/api/admin/payments/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TRIGGER_EMERGENCY_SWEEP",
          purpose: emergencyPurpose.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || "Emergency sweep dispatched successfully!");
        await fetchTreasuryData();
      } else {
        setErrorMessage(data.error || "Emergency sweep failed.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to execute emergency sweep.");
    } finally {
      setActionLoading(false);
    }
  };

  const renderStatusBadge = (status: SweepStatus) => {
    switch (status) {
      case "RECONCILED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>RECONCILED</span>
          </span>
        );
      case "WALLET_RECEIPT_MATCHED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
            <Radio className="w-3 h-3 text-purple-600" />
            <span>WALLET_MATCHED</span>
          </span>
        );
      case "CASHOUT_PROVIDER_CONFIRMED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-blue-600" />
            <span>PROVIDER_CONFIRMED</span>
          </span>
        );
      case "CASHOUT_PENDING":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600 animate-spin" />
            <span>CASHOUT_PENDING</span>
          </span>
        );
      case "CASHOUT_REQUIRES_REVIEW":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-red-600" />
            <span>REQUIRES_REVIEW</span>
          </span>
        );
      case "CASHOUT_FAILED":
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>FAILED</span>
          </span>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl my-auto bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight">MOSA Treasury &amp; Airtel Settlement Sweeps</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Option A
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-600">
                  Strategy 2 Production Safety
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                <span>Receiving Destination (Locked):</span>
                <strong className="text-emerald-400 font-mono flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" /> 0729974065 (Airtel Money)
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTreasuryData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Refresh settlement ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Row 1: KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs">
              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                <span>Available Cleared Balance</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {stats?.clearedMerchantBalance?.toLocaleString() ?? 0}{" "}
                <span className="text-xs font-bold text-slate-500">RWF</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <span>Cleared &amp; eligible for payout to 0729974065</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Pending Customer Collections
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {stats?.pendingCustomerPayments?.toLocaleString() ?? 0}{" "}
                <span className="text-xs font-bold text-slate-500">RWF</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">In flight / Awaiting customer PIN authorization</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                Total Swept to Airtel SIM
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {stats?.totalSweptToAirtel?.toLocaleString() ?? 0}{" "}
                <span className="text-xs font-bold text-slate-500">RWF</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Cumulative settled payouts to 0729974065</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                Total Payout Gateway Fees
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {stats?.totalPayoutFees?.toLocaleString() ?? 0}{" "}
                <span className="text-xs font-bold text-slate-500">RWF</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Captured dynamically from Paypack transactions
              </div>
            </div>
          </div>

          {/* Row 2: Controlled Sweep Progress & Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Progress & Configuration */}
            <div className="lg:col-span-2 p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-black text-slate-900 text-sm">Settlement Sweep Rules &amp; Schedule</h4>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400">Scheduled:</span>
                  <strong className="text-slate-800">23:59 CAT (21:59 UTC on Vercel)</strong>
                </div>
              </div>

              {/* Progress bar towards threshold */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700">Threshold Accumulation Progress:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {stats?.clearedMerchantBalance?.toLocaleString() ?? 0} /{" "}
                    {stats?.config?.threshold?.toLocaleString() ?? 50000} RWF (
                    {stats?.thresholdProgressPct ?? 0}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.thresholdProgressPct ?? 0) >= 100
                        ? "bg-emerald-500"
                        : "bg-gradient-to-r from-blue-500 to-emerald-500"
                    }`}
                    style={{ width: `${stats?.thresholdProgressPct ?? 0}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    {(stats?.thresholdProgressPct ?? 0) >= 100
                      ? "✅ Sweep threshold reached! Scheduled payout eligible."
                      : `Collecting funds. Sweep eligible at ${thresholdInput.toLocaleString()} RWF.`}
                  </span>
                  {stats?.lastSweepAt && (
                    <span>Last sweep: {new Date(stats.lastSweepAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {/* Configuration Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Cash-out Threshold (RWF)
                  </label>
                  <input
                    type="number"
                    min={5000}
                    step={5000}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-800 focus:outline-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default: 50,000 RWF (10 customer registrations)</p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Sweep Mode
                  </label>
                  <select
                    value={sweepModeInput}
                    onChange={(e) => setSweepModeInput(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-emerald-500"
                  >
                    <option value="FULL_BALANCE">Full Cleared Balance (Above Reserve)</option>
                    <option value="EXACT_THRESHOLD">Exact Threshold Chunks (e.g. 50,000 RWF)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Controls how much is swept when triggered</p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Reserve Buffer (RWF)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={reserveAmountInput}
                    onChange={(e) => setReserveAmountInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-800 focus:outline-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Minimum balance retained in Paypack account</p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Primary Destination (Locked)
                  </label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 font-mono text-sm font-bold text-slate-700 select-none">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>0729974065 (Airtel)</span>
                  </div>
                  <p className="text-[10px] text-emerald-700 mt-1 font-semibold">Strictly locked to official receiving SIM</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Automated Sweeps Status (Production Gate)
                  </label>
                  <div className="flex items-center gap-3 pt-1">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSweepInput}
                        onChange={(e) => setAutoSweepInput(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      <span className="ml-2.5 text-xs font-bold text-slate-700">
                        {autoSweepInput ? "Active (Automated Sweeps Enabled)" : "Paused (Manual SUPER_ADMIN Only)"}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Save Settlement Configuration</span>
                </button>
              </div>
            </div>

            {/* Right Col: Emergency Payout & Fee Economics */}
            <div className="space-y-4">
              {/* Emergency Sweep Box */}
              <div className="p-5 rounded-3xl bg-gradient-to-br from-rose-50 via-white to-amber-50 border border-rose-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-rose-900 font-black text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>SUPER_ADMIN Emergency Payout</span>
                </div>

                {/* Pre-Authorization Payout Preview Breakdown */}
                <div className="p-3.5 rounded-2xl bg-white/90 border border-rose-200 text-xs space-y-1.5">
                  <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                    Payout Breakdown Preview
                  </div>
                  <div className="flex justify-between items-center text-slate-600 text-[11px]">
                    <span>Cleared Balance:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {preview?.clearedBalance?.toLocaleString() ?? stats?.clearedMerchantBalance?.toLocaleString() ?? 0} RWF
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 text-[11px]">
                    <span>Reserve Buffer:</span>
                    <span className="font-mono text-slate-700">
                      {preview?.reserveAmount?.toLocaleString() ?? reserveAmountInput.toLocaleString()} RWF
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-900 text-[11px] font-bold border-t border-slate-100 pt-1">
                    <span>Target Sweep:</span>
                    <span className="font-mono text-rose-700">
                      {preview?.sweepAmount?.toLocaleString() ?? 0} RWF
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 text-[10px]">
                    <span>Estimated Fee:</span>
                    <span className="font-mono italic">
                      ~{preview?.estimatedFee?.toLocaleString() ?? 0} RWF (Pending Paypack confirmation)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-800 text-xs font-black border-t border-slate-100 pt-1">
                    <span>Expected Net:</span>
                    <span className="font-mono">
                      {preview?.expectedNetPayout?.toLocaleString() ?? 0} RWF
                    </span>
                  </div>
                </div>

                {showConfirmSweep ? (
                  <div className="p-3.5 rounded-2xl bg-white border border-rose-300 space-y-2.5 text-xs">
                    <div>
                      <label className="font-bold text-rose-900 block mb-1">
                        Mandatory Audit Justification (Purpose):
                      </label>
                      <input
                        type="text"
                        value={emergencyPurpose}
                        onChange={(e) => setEmergencyPurpose(e.target.value)}
                        placeholder="e.g. End-of-week tax reserve transfer"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-rose-500"
                      />
                    </div>

                    <p className="text-[11px] text-slate-600">
                      Target destination is hard-locked to Airtel Money SIM:{" "}
                      <strong className="font-mono text-slate-900">0729974065</strong>.
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleTriggerEmergencySweep}
                        disabled={actionLoading || !emergencyPurpose || emergencyPurpose.trim().length < 5}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Confirm &amp; Disburse</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfirmSweep(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!stats?.clearedMerchantBalance || stats.clearedMerchantBalance <= 0 || actionLoading}
                    onClick={() => setShowConfirmSweep(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Authorize Emergency Payout</span>
                  </button>
                )}
              </div>

              {/* Verified Tariff Mechanics */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Production Tariff Mechanics</span>
                </div>
                <div className="space-y-1 text-slate-600 text-[11px] leading-relaxed">
                  <p>
                    • <strong>Batching Efficiency:</strong> Fixed per-transaction B2C charges and telecom network roundtrips are reduced by consolidating daily payouts into a single batch at 50,000 RWF.
                  </p>
                  <p>
                    • <strong>Dynamic Fees:</strong> Payout fees are captured directly from Paypack's API response and verified during webhook reconciliation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Settlement Sweeps Ledger Table */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-600" />
                <h4 className="font-black text-slate-900 text-sm">Settlement Payout History &amp; Multi-State Ledger</h4>
              </div>
              <span className="text-xs text-slate-400 font-medium">{history.length} recorded sweep(s)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                    <th className="py-2.5 px-3">Sweep Ref</th>
                    <th className="py-2.5 px-3">Payout Ref</th>
                    <th className="py-2.5 px-3">Gross Amount</th>
                    <th className="py-2.5 px-3">Actual Fee</th>
                    <th className="py-2.5 px-3">Net to Airtel</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Lifecycle Status</th>
                    <th className="py-2.5 px-3">Settled At</th>
                    <th className="py-2.5 px-3">Bridge Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                        No settlement sweeps recorded yet. Payouts trigger automatically when scheduled and authorized.
                      </td>
                    </tr>
                  ) : (
                    history.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800">
                          {record.sweepReference}
                          {record.purpose && (
                            <div className="text-[10px] text-slate-400 font-sans font-normal truncate max-w-[140px]">
                              {record.purpose}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                          {record.payoutRef || "—"}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {record.amount.toLocaleString()} RWF
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                          {record.isFeeEstimated ? `~${record.fee} RWF (Est)` : `${record.fee.toLocaleString()} RWF`}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {record.netAmount.toLocaleString()} RWF
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              record.triggerType === "MANUAL_EMERGENCY"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {record.triggerType === "MANUAL_EMERGENCY" ? "Emergency" : "Scheduled"}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {renderStatusBadge(record.status)}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px]">
                          {record.settledAt
                            ? new Date(record.settledAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              }) +
                              " " +
                              new Date(record.settledAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {record.smsBridgeEvidenceRef ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold">
                              SMS Reconciled
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Strict Financial Separation: Customer cash-ins are confirmed independently of cash-out payouts.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
