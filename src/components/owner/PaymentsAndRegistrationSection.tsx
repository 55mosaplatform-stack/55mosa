"use client";

import React, { useState, useEffect } from "react";
import { useLanguage } from "@/lib/i18n";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Receipt,
  Printer,
  Download,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Store,
  DollarSign,
  Calendar,
  AlertCircle,
  ArrowRight,
  Info,
  ChevronDown,
  Building,
  Smartphone,
  Eye,
  X,
  FileText,
  BadgeCheck,
} from "lucide-react";
import { UrubutoStyleCheckout } from "@/components/payments/UrubutoStyleCheckout";

interface PaymentsAndRegistrationSectionProps {
  businessId: string;
  business: any;
  lang?: string;
  onPaymentCompleted?: () => void;
}

export function PaymentsAndRegistrationSection({
  businessId,
  business: initialBusiness,
  lang: propLang,
  onPaymentCompleted,
}: PaymentsAndRegistrationSectionProps) {
  const { lang: contextLang } = useLanguage();
  const lang = propLang || contextLang || "en";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<any>(null);
  const [selectedBizId, setSelectedBizId] = useState(businessId);

  // Checkout Modal State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutType, setCheckoutType] = useState<"REGISTRATION" | "RENEWAL">("REGISTRATION");

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // Success Notification Banner
  const [successBanner, setSuccessBanner] = useState("");

  const fetchPaymentsData = async (bizId: string) => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await fetch(`/api/owner/payments?businessId=${encodeURIComponent(bizId)}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      } else {
        setErrorMsg(json.error || "Failed to load payments and registration data.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while loading payments data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBizId) {
      fetchPaymentsData(selectedBizId);
    }
  }, [selectedBizId]);

  const handleCheckoutSuccess = async (receipt: any, payment: any) => {
    setCheckoutModalOpen(false);
    setSuccessBanner(
      lang === "rw"
        ? `Kwishyura byemejwe neza! Inyemezabwishyu yawe ni: ${receipt?.receiptNumber || payment?.paymentReference}.`
        : `Payment verified & confirmed! Official Receipt: ${receipt?.receiptNumber || payment?.paymentReference}.`
    );
    await fetchPaymentsData(selectedBizId);
    if (onPaymentCompleted) {
      onPaymentCompleted();
    }
    if (receipt) {
      setSelectedReceipt(receipt);
      setReceiptModalOpen(true);
    }
    setTimeout(() => setSuccessBanner(""), 8000);
  };

  const handleDownloadReceipt = (receipt: any) => {
    const receiptData = {
      platform: "55 MOSA Platform Ltd (Kigali, Rwanda)",
      receiptNumber: receipt.receiptNumber,
      issuedAt: receipt.issuedAt,
      businessName: data?.business?.name || receipt.businessName,
      amountPaid: `${receipt.amountPaid.toLocaleString()} ${receipt.currency}`,
      paymentMethod: receipt.paymentMethod,
      paymentReference: receipt.paymentReference || receipt.payment?.paymentReference,
      providerTransactionRef: receipt.providerTransactionRef,
      receiptType: receipt.receiptType,
      periodCoveredStart: receipt.periodCoveredStart,
      periodCoveredEnd: receipt.periodCoveredEnd,
      verificationUrl: `${typeof window !== "undefined" ? window.location.origin : "https://mosa.rw"}/api/payments/receipt/${receipt.receiptNumber}`,
    };

    const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${receipt.receiptNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 text-center shadow-card space-y-4 animate-pulse">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-slate-600 text-sm font-medium">
          {lang === "rw" ? "Turimo gukuramo amakuru y'imari..." : "Loading payments, invoices & receipts..."}
        </div>
      </div>
    );
  }

  const business = data?.business || initialBusiness;
  const paymentStatus = data?.paymentStatus || "UNPAID";
  const outstandingBalance = data?.outstandingBalance ?? 5000;
  const outstandingType = data?.outstandingType || "REGISTRATION";
  const fees = data?.fees;
  const lastPayment = data?.lastSuccessfulPayment;
  const pendingInvoice = data?.pendingInvoice;
  const gracePeriod = data?.gracePeriod;
  const reminders = data?.reminders || [];
  const payments = data?.payments || [];
  const receipts = data?.receipts || [];
  const userBusinesses = data?.userBusinesses || [];

  return (
    <div className="space-y-6">
      {/* Multi-Business Switcher (if owner has multiple registered businesses) */}
      {userBusinesses.length > 1 && (
        <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <Store className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-300 font-medium">
                {lang === "rw" ? "Hitamo ubucuruzi ushaka kurebera imari:" : "Managing payments for business:"}
              </div>
              <div className="font-bold text-sm text-white">{business?.name}</div>
            </div>
          </div>
          <div className="relative">
            <select
              value={selectedBizId}
              onChange={(e) => setSelectedBizId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {userBusinesses.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.status})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-950 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-emerald-900">{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner("")}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex items-center gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="text-xs font-bold text-rose-900">{errorMsg}</div>
        </div>
      )}

      {/* SECTION HEADER & REGISTRATION STATUS */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-xl bg-amber-100 text-amber-800">
              <CreditCard className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {lang === "rw" ? "Ubuyobozi bw'Imari & Kwiyandikisha" : "Financial Accountability & Invoices"}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {lang === "rw" ? "Kwishyura & Kwiyandikisha" : "Payments & Registration"}
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {lang === "rw"
              ? "Reba amafaranga ugomba kwishyura, igihe ntarengwa cyo kuvugurura, inyemezabwishyu zose za MOSA, no kwishyura ako kanya ukoresheje Mobile Money cyangwa Banki."
              : "Review your registration status, renewal deadlines, payment history, and download official numbered MOSA receipts."}
          </p>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Business Listing Status */}
          <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-slate-50 border-slate-200 text-slate-800">
            <Store className="w-3.5 h-3.5 text-slate-500" />
            <span>Listing: {business?.status}</span>
          </div>

          {/* Payment Status Badge */}
          {paymentStatus === "PAID" ? (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{lang === "rw" ? "BYISHYUWE (PAID)" : "PAID & CURRENT"}</span>
            </div>
          ) : paymentStatus === "PENDING" ? (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-amber-50 border-amber-300 text-amber-900 shadow-xs animate-pulse">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{lang === "rw" ? "BIRATEGEREREJWE (PENDING)" : "APPROVAL PENDING"}</span>
            </div>
          ) : paymentStatus === "DUE_SOON" ? (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-yellow-50 border-yellow-300 text-yellow-900 shadow-xs">
              <Clock className="w-3.5 h-3.5 text-yellow-600" />
              <span>{lang === "rw" ? "IVUGURURA RIREMEJE (DUE SOON)" : "RENEWAL DUE SOON"}</span>
            </div>
          ) : paymentStatus === "OVERDUE" ? (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-orange-50 border-orange-300 text-orange-950 shadow-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
              <span>{lang === "rw" ? "IGIHE CYARARENZE (OVERDUE - GRACE)" : "OVERDUE (GRACE PERIOD)"}</span>
            </div>
          ) : paymentStatus === "EXPIRED" ? (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-rose-50 border-rose-300 text-rose-950 shadow-xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{lang === "rw" ? "CYARANGIYE (SUSPENDED)" : "EXPIRED & SUSPENDED"}</span>
            </div>
          ) : (
            <div className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border bg-rose-50 border-rose-300 text-rose-900 shadow-xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{lang === "rw" ? "NTIBYISHYUWE (UNPAID)" : "REGISTRATION UNPAID"}</span>
            </div>
          )}
        </div>
      </div>

      {/* 4 CORE FINANCIAL METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Initial Registration Fee */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {lang === "rw" ? "Amafaranga yo Kwiyandikisha" : "Initial Registration"}
            </span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {fees?.initialRegistrationFee?.effectiveAmount?.toLocaleString() || "5,000"}{" "}
            <span className="text-xs font-bold text-slate-400">{fees?.initialRegistrationFee?.currency || "RWF"}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            {fees?.initialRegistrationFee?.isFree ? (
              <span className="text-emerald-600 font-bold">100% Free Promotional Waiver</span>
            ) : (
              <span>12-Month Coverage Standard Fee</span>
            )}
          </div>
        </div>

        {/* Metric 2: Annual Renewal Fee */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {lang === "rw" ? "Amafaranga yo Kuvugurura" : "Annual Renewal Fee"}
            </span>
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {fees?.annualRenewalFee?.effectiveAmount?.toLocaleString() || "5,000"}{" "}
            <span className="text-xs font-bold text-slate-400">{fees?.annualRenewalFee?.currency || "RWF"}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            <span>Per year • 7-day grace period</span>
          </div>
        </div>

        {/* Metric 3: Outstanding Balance */}
        <div
          className={`p-5 rounded-3xl border shadow-sm flex flex-col justify-between ${
            outstandingBalance > 0
              ? "bg-rose-50/60 border-rose-200 text-rose-950"
              : "bg-emerald-50/60 border-emerald-200 text-emerald-950"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
              {lang === "rw" ? "Amafaranga Asigaye" : "Outstanding Balance"}
            </span>
            <Receipt className="w-4 h-4 opacity-75" />
          </div>
          <div className="text-2xl font-black">
            {outstandingBalance.toLocaleString()}{" "}
            <span className="text-xs font-bold opacity-70">{fees?.initialRegistrationFee?.currency || "RWF"}</span>
          </div>
          <div className="text-[11px] font-medium mt-2">
            {outstandingBalance > 0 ? (
              <span className="text-rose-700 font-bold">
                {outstandingType === "REGISTRATION" ? "Initial Fee Due" : "Annual Renewal Due"}
              </span>
            ) : (
              <span className="text-emerald-700 font-bold">Zero Outstanding Balance</span>
            )}
          </div>
        </div>

        {/* Metric 4: Expiration & Next Renewal */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {lang === "rw" ? "Igihe Cy'Ivugurura" : "Expiry / Renewal"}
            </span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-black text-slate-900">
            {business?.registrationExpiresAt
              ? new Date(business.registrationExpiresAt).toLocaleDateString()
              : "Not Yet Active"}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {gracePeriod?.isActive ? (
              <span className="text-orange-600 font-bold">
                Grace ends in {gracePeriod.daysRemaining} day(s)
              </span>
            ) : business?.registrationExpiresAt ? (
              <span>Valid 365 Days</span>
            ) : (
              <span>Awaiting Registration Fee</span>
            )}
          </div>
        </div>
      </div>

      {/* ACTIVE INVOICES & PAY NOW CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {outstandingBalance > 0
                ? lang === "rw"
                  ? "Inyemezabwishyu Yiteguye Kwishyurwa"
                  : "Active Actionable Invoice"
                : lang === "rw"
                ? "Konti Yishyuwe Neza"
                : "Account In Good Standing"}
            </span>
            <h3 className="text-xl font-black text-white mt-1.5">
              {outstandingType === "REGISTRATION"
                ? lang === "rw"
                  ? "Kwishyura Kwiyandikisha k'Ubucuruzi"
                  : "Business Initial Registration Fee"
                : outstandingType === "RENEWAL"
                ? lang === "rw"
                  ? "Kuvugurura Kwiyandikisha ku Mwaka"
                  : "12-Month Annual Registration Renewal"
                : lang === "rw"
                ? "Ubucuruzi Bwawe Burakora Neza"
                : "Active MOSA Verified Storefront"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Business: <span className="text-white font-bold">{business?.name}</span> • ID:{" "}
              <span className="font-mono text-slate-300">{business?.id}</span>
            </p>
          </div>

          {/* Action Button */}
          <div className="shrink-0 flex items-center gap-3">
            {outstandingBalance > 0 ? (
              <button
                onClick={() => {
                  setCheckoutType(outstandingType === "RENEWAL" ? "RENEWAL" : "REGISTRATION");
                  setCheckoutModalOpen(true);
                }}
                className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <Smartphone className="w-4 h-4" />
                <span>
                  {outstandingType === "RENEWAL"
                    ? lang === "rw"
                      ? "Vugurura Ubu (5,000 RWF)"
                      : "RENEW REGISTRATION NOW"
                    : lang === "rw"
                    ? "Ishyura Kwiyandikisha Ubu"
                    : "PAY REGISTRATION FEE NOW"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setCheckoutType("RENEWAL");
                  setCheckoutModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === "rw" ? "Vugurura Imburagihe (+12 Months)" : "Renew Early (+12 Months)"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Invoice Status Context */}
        {pendingInvoice ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="font-bold text-amber-300">
                  {lang === "rw" ? "Kwishyura Kuri Gutegerezwa Kwemezwa" : "Approval Prompt Dispatched / Pending Confirmation"}
                </div>
                <div className="text-[11px] text-amber-200/90 font-mono mt-0.5">
                  Ref: {pendingInvoice.paymentReference} • Channel: {pendingInvoice.provider} • Amount:{" "}
                  {pendingInvoice.feeAmount?.toLocaleString()} {pendingInvoice.currency}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setCheckoutType(pendingInvoice.paymentType === "ANNUAL_RENEWAL" ? "RENEWAL" : "REGISTRATION");
                setCheckoutModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shrink-0 cursor-pointer hover:bg-amber-400 transition"
            >
              {lang === "rw" ? "Reba Imimerere / Shyiramo PIN" : "Resume / Check Status"}
            </button>
          </div>
        ) : lastPayment ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Last Successful Payment:{" "}
                <strong className="text-slate-200">
                  {lastPayment.feeAmount?.toLocaleString()} {lastPayment.currency}
                </strong>{" "}
                via {lastPayment.provider} on {new Date(lastPayment.verifiedAt).toLocaleDateString()}
              </span>
            </div>
            {lastPayment.receiptNumber && (
              <button
                onClick={() => {
                  const r = receipts.find((rec: any) => rec.receiptNumber === lastPayment.receiptNumber);
                  if (r) {
                    setSelectedReceipt(r);
                    setReceiptModalOpen(true);
                  }
                }}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Receipt #{lastPayment.receiptNumber}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* AUTOMATED PAYMENT REMINDERS (IF ANY) */}
      {reminders.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-card space-y-3.5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-extrabold text-sm text-slate-900">
              {lang === "rw" ? "Ibyibutso by'Ubwishyu" : "Active Payment & Renewal Deadlines"}
            </h3>
          </div>
          <div className="space-y-2.5">
            {reminders.map((r: any) => (
              <div
                key={r.id}
                className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  r.severity === "URGENT"
                    ? "bg-rose-50 border-rose-200 text-rose-950"
                    : r.severity === "WARNING"
                    ? "bg-amber-50 border-amber-200 text-amber-950"
                    : "bg-blue-50 border-blue-200 text-blue-950"
                }`}
              >
                <div>
                  <div className="font-extrabold text-xs flex items-center gap-2">
                    <span>{lang === "rw" ? r.titleRw || r.title : r.title}</span>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-white/70 border border-black/10">
                      {r.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] opacity-90">{lang === "rw" ? r.messageRw || r.message : r.message}</p>
                </div>
                {r.isPaymentReminder && (
                  <button
                    onClick={() => {
                      setCheckoutType(r.type.startsWith("RENEWAL") ? "RENEWAL" : "REGISTRATION");
                      setCheckoutModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shrink-0 cursor-pointer shadow-xs"
                  >
                    {lang === "rw" ? "Ishyura Ubu" : "PAY NOW"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPLETE PAYMENT HISTORY TABLE */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {lang === "rw" ? "Amateka y'Ubwishyu" : "Complete Payment History"}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === "rw"
                ? "Urutonde rusesenguye rw'ubwishyu bwose bw'uyu mwirondoro w'ubucuruzi."
                : "Audited financial ledger of all registration and renewal payment transactions."}
            </p>
          </div>
          <div className="text-xs font-bold text-slate-500">Total Records: {payments.length}</div>
        </div>

        {payments.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p>{lang === "rw" ? "Nta nyandiko z'ubwishyu ziraboneka." : "No payment history recorded yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="pb-3 pl-1">Date</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Channel</th>
                  <th className="pb-3">Reference</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right pr-1">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 pl-1 text-[11px] font-medium text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 font-semibold text-slate-900">
                      {p.paymentType === "ANNUAL_RENEWAL"
                        ? "Annual Renewal"
                        : p.paymentType === "ADMIN_WAIVER"
                        ? "Admin Waiver"
                        : "Registration"}
                    </td>
                    <td className="py-3">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                        {p.provider}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[11px] text-slate-600">{p.paymentReference}</td>
                    <td className="py-3 font-bold text-slate-900">
                      {p.feeAmount?.toLocaleString()} {p.currency}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          p.status === "CONFIRMED"
                            ? "bg-emerald-100 text-emerald-800"
                            : p.status === "PENDING" || p.status === "WAITING_FOR_CUSTOMER_APPROVAL"
                            ? "bg-amber-100 text-amber-900 animate-pulse"
                            : p.status === "FAILED"
                            ? "bg-rose-100 text-rose-800"
                            : p.status === "CANCELLED"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 text-right pr-1">
                      {p.receiptNumber ? (
                        <button
                          onClick={() => {
                            const r = receipts.find((rec: any) => rec.receiptNumber === p.receiptNumber);
                            if (r) {
                              setSelectedReceipt(r);
                              setReceiptModalOpen(true);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-200 transition cursor-pointer"
                        >
                          View Receipt
                        </button>
                      ) : p.status === "PENDING" || p.status === "WAITING_FOR_CUSTOMER_APPROVAL" ? (
                        <button
                          onClick={() => {
                            setCheckoutType(p.paymentType === "ANNUAL_RENEWAL" ? "RENEWAL" : "REGISTRATION");
                            setCheckoutModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition cursor-pointer"
                        >
                          Complete
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OFFICIAL MOSA RECEIPTS LIST */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {lang === "rw" ? "Inyemezabwishyu Zawe Zemewe" : "Official MOSA Receipts"}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === "rw"
                ? "Inyemezabwishyu zifite numero zizewe z'ubuyobozi bwa MOSA zo gusohora no kubika."
                : "Official sequentially numbered tax receipts with 12-month validity verification."}
            </p>
          </div>
          <div className="text-xs font-bold text-slate-500">Total Receipts: {receipts.length}</div>
        </div>

        {receipts.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <p>{lang === "rw" ? "Nta nyemezabwishyu irasohoka." : "No official receipts issued yet."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {receipts.map((r: any) => (
              <div
                key={r.id}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-amber-300 transition-all shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-mono font-bold text-xs text-slate-900">{r.receiptNumber}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                    VERIFIED
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    Amount:{" "}
                    <strong className="text-slate-900">
                      {r.amountPaid.toLocaleString()} {r.currency}
                    </strong>{" "}
                    via {r.paymentMethod}
                  </div>
                  <div>Issued Date: {new Date(r.issuedAt).toLocaleDateString()}</div>
                  {r.periodCoveredStart && r.periodCoveredEnd && (
                    <div className="text-[11px] text-slate-500">
                      Coverage: {new Date(r.periodCoveredStart).toLocaleDateString()} &rarr;{" "}
                      {new Date(r.periodCoveredEnd).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setSelectedReceipt(r);
                      setReceiptModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View & Print</span>
                  </button>
                  <button
                    onClick={() => handleDownloadReceipt(r)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Data</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CHECKOUT MODAL (INTEGRATED URUBUTO-STYLE PAYMENT ENGINE) */}
      {checkoutModalOpen && business && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {checkoutType === "RENEWAL" ? "Annual Renewal Checkout" : "Initial Registration Checkout"}
                </span>
                <h3 className="font-bold text-lg text-slate-900 mt-1">
                  {checkoutType === "RENEWAL"
                    ? lang === "rw"
                      ? "Kuvugurura Kwiyandikisha ku Mwaka"
                      : "12-Month Annual Renewal"
                    : lang === "rw"
                    ? "Kwishyura Kwiyandikisha"
                    : "Pay Registration Fee"}
                </h3>
              </div>
              <button
                onClick={() => setCheckoutModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <UrubutoStyleCheckout
              businessId={business.id}
              businessName={business.name}
              defaultPhone={business.phone || ""}
              feeConfig={
                checkoutType === "RENEWAL"
                  ? {
                      amount: fees?.annualRenewalFee?.effectiveAmount || 5000,
                      baseAmount: fees?.annualRenewalFee?.baseAmount || 5000,
                      discount: fees?.annualRenewalFee?.discount || 0,
                      isFree: fees?.annualRenewalFee?.isFree || false,
                      currency: fees?.annualRenewalFee?.currency || "RWF",
                      promotion: fees?.annualRenewalFee?.promotion,
                    }
                  : {
                      amount: fees?.initialRegistrationFee?.effectiveAmount || 5000,
                      baseAmount: fees?.initialRegistrationFee?.baseAmount || 5000,
                      discount: fees?.initialRegistrationFee?.discount || 0,
                      isFree: fees?.initialRegistrationFee?.isFree || false,
                      currency: fees?.initialRegistrationFee?.currency || "RWF",
                      promotion: fees?.initialRegistrationFee?.promotion,
                    }
              }
              checkoutType={checkoutType}
              onPaymentSuccess={handleCheckoutSuccess}
            />
          </div>
        </div>
      )}

      {/* OFFICIAL RECEIPT VIEW & PRINT MODAL */}
      {receiptModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 print:p-0 print:border-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">Official MOSA Payment Receipt</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => handleDownloadReceipt(selectedReceipt)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setReceiptModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Layout */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 space-y-5 font-sans">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xl font-black text-slate-900 tracking-tight">55 MOSA Platform Ltd</div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    National Business & Services Discovery Infrastructure
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Kigali, Rwanda • Verified Merchant Receipt</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black font-mono text-amber-700">{selectedReceipt.receiptNumber}</div>
                  <div className="text-[10px] text-slate-400">
                    Issued: {new Date(selectedReceipt.issuedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Business & Owner Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Billed Business</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{business?.name}</div>
                  <div className="text-[11px] text-slate-600">ID: {business?.id}</div>
                  <div className="text-[11px] text-slate-600">Category: {business?.categoryDisplay || "Services"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Payment Reference</div>
                  <div className="font-mono text-xs font-bold text-slate-900 mt-0.5">
                    {selectedReceipt.paymentReference || "MOSA-PAYMENT"}
                  </div>
                  <div className="text-[11px] text-slate-600">Method: {selectedReceipt.paymentMethod}</div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Provider Ref: {selectedReceipt.providerTransactionRef || "VERIFIED-GW"}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-[10px] uppercase text-slate-600 flex justify-between">
                  <span>Description</span>
                  <span>Amount</span>
                </div>
                <div className="px-3.5 py-3 flex justify-between items-center border-b border-slate-100">
                  <div>
                    <div className="font-bold text-slate-900">
                      {selectedReceipt.receiptType === "ANNUAL_RENEWAL"
                        ? "12-Month Annual Registration Renewal"
                        : "Official Business Registration Fee"}
                    </div>
                    {selectedReceipt.periodCoveredStart && selectedReceipt.periodCoveredEnd && (
                      <div className="text-[11px] text-slate-500">
                        Coverage: {new Date(selectedReceipt.periodCoveredStart).toLocaleDateString()} to{" "}
                        {new Date(selectedReceipt.periodCoveredEnd).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="font-bold text-slate-900">
                    {selectedReceipt.amountPaid.toLocaleString()} {selectedReceipt.currency}
                  </div>
                </div>
                <div className="bg-slate-50 px-3.5 py-2.5 flex justify-between items-center font-black text-sm text-slate-900">
                  <span>Total Paid (RWF)</span>
                  <span className="text-emerald-700">
                    {selectedReceipt.amountPaid.toLocaleString()} {selectedReceipt.currency}
                  </span>
                </div>
              </div>

              {/* Footer Verification Stamp */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Authoritative Cryptographic Verification • Settled</span>
                </div>
                <div>Status: VERIFIED & CONFIRMED</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
