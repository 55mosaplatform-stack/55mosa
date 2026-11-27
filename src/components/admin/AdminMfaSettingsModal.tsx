"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  KeyRound,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  X,
  AlertTriangle,
  Lock,
  Download,
} from "lucide-react";

interface AdminMfaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminMfaSettingsModal({ isOpen, onClose }: AdminMfaSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    enrolled: boolean;
    totpEnabled: boolean;
    recoveryCodesCount: number;
    enrolledAt: string | null;
  } | null>(null);

  // Setup / Enrollment State
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<{
    setupToken: string;
    secret: string;
    otpauthUri: string;
    qrCodeUrl: string;
    recoveryCodes: string[];
  } | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Disable / Regenerate Modal State
  const [isDisabling, setIsDisabling] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/mfa/status");
      const data = await res.json();
      if (res.ok && data.mfa) {
        setStatus(data.mfa);
      }
    } catch {
      // Ignore network errors on passive fetch
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
      setSuccessMsg("");
      setIsSettingUp(false);
      setIsDisabling(false);
      setIsRegenerating(false);
      setNewRecoveryCodes(null);
      fetchStatus();
    }
  }, [isOpen]);

  const handleStartSetup = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to initiate MFA setup.");
        return;
      }
      setSetupData(data);
      setIsSettingUp(true);
    } catch {
      setErrorMsg("Network error connecting to MFA configuration service.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData) return;
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/mfa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupToken: setupData.setupToken,
          code: confirmationCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Invalid verification code.");
        return;
      }

      setSuccessMsg("Authenticator App successfully activated for your account!");
      setIsSettingUp(false);
      setSetupData(null);
      setConfirmationCode("");
      await fetchStatus();
    } catch {
      setErrorMsg("Network error verifying MFA activation.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: verifyPassword,
          code: verifyCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to disable MFA.");
        return;
      }

      setSuccessMsg("Multi-Factor Authentication disabled.");
      setIsDisabling(false);
      setVerifyPassword("");
      setVerifyCode("");
      await fetchStatus();
    } catch {
      setErrorMsg("Network error disabling MFA.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/mfa/regenerate-recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: verifyPassword,
          code: verifyCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to regenerate recovery codes.");
        return;
      }

      setNewRecoveryCodes(data.recoveryCodes);
      setSuccessMsg("New emergency recovery codes generated! Please save them immediately.");
      setIsRegenerating(false);
      setVerifyPassword("");
      setVerifyCode("");
      await fetchStatus();
    } catch {
      setErrorMsg("Network error regenerating recovery codes.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "codes" | "secret") => {
    navigator.clipboard.writeText(text);
    if (type === "codes") {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const downloadRecoveryCodes = (codes: string[]) => {
    const content = `55 MOSA Command Center — Emergency Recovery Codes\nGenerated: ${new Date().toISOString()}\n\nEach code can only be used once:\n\n${codes.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nKeep these codes strictly confidential. Store in a secure offline location.`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `55mosa-recovery-codes-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Administrator Multi-Factor Authentication</h2>
              <p className="text-[11px] text-slate-300">TOTP Authenticator & Emergency Recovery Codes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Newly Generated Recovery Codes Banner */}
          {newRecoveryCodes && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  Your New Recovery Codes
                </span>
                <button
                  onClick={() => downloadRecoveryCodes(newRecoveryCodes)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .txt
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded-xl border border-amber-200/80 font-mono text-xs text-slate-800">
                {newRecoveryCodes.map((code, idx) => (
                  <div key={idx} className="px-2 py-1 bg-slate-50 rounded">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View 1: Active Status Overview */}
          {!isSettingUp && !isDisabling && !isRegenerating && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status?.enrolled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {status?.enrolled ? "Authenticator App Active" : "Authenticator App Not Configured"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {status?.enrolled
                        ? `Enrolled: ${new Date(status.enrolledAt || "").toLocaleDateString()}`
                        : "Compatible with Google Authenticator, Microsoft Authenticator & 1Password"}
                    </div>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${status?.enrolled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                  {status?.enrolled ? "Protected" : "Optional"}
                </span>
              </div>

              {status?.enrolled ? (
                <div className="space-y-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600">Remaining Recovery Codes:</span>
                    <span className="font-bold text-slate-900 px-2 py-0.5 bg-slate-200 rounded-md">
                      {status.recoveryCodesCount} of 8
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => setIsRegenerating(true)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                      Regenerate Codes
                    </button>
                    <button
                      onClick={() => setIsDisabling(true)}
                      className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition border border-red-200 flex items-center justify-center gap-1.5"
                    >
                      Disable MFA
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="text-xs text-slate-600 leading-relaxed">
                    Strengthen Command Center security with Time-based One-Time Passwords (TOTP). Codes are generated directly on your mobile device without relying on email delivery.
                  </div>

                  <button
                    onClick={handleStartSetup}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-emerald-200" />
                    )}
                    <span>Set Up Authenticator App (Google / Microsoft)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* View 2: Setup / Enrollment Flow */}
          {isSettingUp && setupData && (
            <form onSubmit={handleVerifySetup} className="space-y-5">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                <span className="font-bold">Step 1:</span> Scan the QR code with your authenticator app, or copy the manual entry key.
              </div>

              {/* QR Code and Secret Display */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={setupData.qrCodeUrl}
                    alt="MFA QR Code"
                    width={140}
                    height={140}
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-2 text-xs flex-1 w-full">
                  <div className="text-slate-500 text-[11px] font-medium">Manual Setup Key (Base32):</div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200 font-mono text-xs break-all text-slate-900 flex items-center justify-between gap-1">
                    <span>{setupData.secret}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(setupData.secret, "secret")}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Copy Key"
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400">Account: 55 MOSA • Time-based (30s)</div>
                </div>
              </div>

              {/* Recovery Codes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Step 2: Save Emergency Recovery Codes</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(setupData.recoveryCodes.join("\n"), "codes")}
                      className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700 flex items-center gap-1"
                    >
                      {copiedCodes ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      Copy All
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadRecoveryCodes(setupData.recoveryCodes)}
                      className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Save File
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs text-slate-800">
                  {setupData.recoveryCodes.map((c, i) => (
                    <div key={i} className="px-2 py-1 bg-white rounded border border-slate-100">
                      {c}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  If you ever lose access to your authenticator device, each recovery code can be used once to regain access.
                </p>
              </div>

              {/* Step 3: Verify and Activate */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800">
                  Step 3: Enter the 6-Digit Code from Your Authenticator App
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-center font-mono text-base font-bold tracking-widest focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading || confirmationCode.length !== 6}
                    className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Verify & Activate"}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsSettingUp(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel Setup
                </button>
              </div>
            </form>
          )}

          {/* View 3: Disable Confirmation Modal */}
          {isDisabling && (
            <form onSubmit={handleDisableMfa} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                <span className="font-bold">Security Confirmation:</span> Disabling MFA will reduce your account protection. Please enter your administrator password and an authenticator/recovery code to confirm.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Administrator Password</label>
                <input
                  type="password"
                  required
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">6-Digit Code or Recovery Code</label>
                <input
                  type="text"
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter TOTP code or recovery code"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDisabling(false)}
                  className="py-2 px-3 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !verifyPassword || !verifyCode}
                  className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Confirm & Disable MFA"}
                </button>
              </div>
            </form>
          )}

          {/* View 4: Regenerate Recovery Codes Form */}
          {isRegenerating && (
            <form onSubmit={handleRegenerateCodes} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <span className="font-bold">Regenerate Recovery Codes:</span> Existing recovery codes will be permanently invalidated and replaced with 8 new codes.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Administrator Password</label>
                <input
                  type="password"
                  required
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Current 6-Digit Authenticator Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono tracking-widest text-center font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegenerating(false)}
                  className="py-2 px-3 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !verifyPassword || verifyCode.length !== 6}
                  className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Generate New Codes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
