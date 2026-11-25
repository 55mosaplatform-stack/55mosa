"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ShieldAlert,
  Lightbulb,
  AlertTriangle,
  MapPinOff,
  Wrench,
  Handshake,
  Mail,
  Upload,
  X,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Lock,
  ArrowLeft,
  Building2,
  HelpCircle,
  FileText
} from "lucide-react";

interface CategoryOption {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: "SUGGESTION",
    label: "Suggestion & Improvement",
    description: "Ideas to enhance 55 MOSA discovery, merchant tools, or community experience.",
    icon: Lightbulb,
    color: "amber",
  },
  {
    id: "COMPLAINT_FEEDBACK",
    label: "Complaint & Feedback",
    description: "Service issues, bad experience with platform, or general dissatisfaction.",
    icon: AlertTriangle,
    color: "orange",
  },
  {
    id: "INCORRECT_INFO",
    label: "Incorrect Business Information",
    description: "Wrong address, closed shop, outdated phone number, or incorrect pricing.",
    icon: MapPinOff,
    color: "blue",
  },
  {
    id: "FRAUD_MISCONDUCT",
    label: "Suspicious Business, Fraud or Misconduct",
    description: "Fake listings, extortion, payment scams, or illicit activity.",
    icon: ShieldAlert,
    color: "rose",
    badge: "Priority Review",
  },
  {
    id: "TECHNICAL_ISSUE",
    label: "Technical Problem / Bug",
    description: "Broken links, page crash, map rendering glitch, or mobile issues.",
    icon: Wrench,
    color: "slate",
  },
  {
    id: "PARTNERSHIP",
    label: "Partnership & Collaboration",
    description: "Commercial integration, community expansion, or institutional cooperation.",
    icon: Handshake,
    color: "emerald",
  },
  {
    id: "GENERAL_MESSAGE",
    label: "General Administration Message",
    description: "Questions, inquiries, or notes directly for MOSA leadership and governance.",
    icon: Mail,
    color: "indigo",
  },
];

function MosaDirectForm() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "GENERAL_MESSAGE";
  const initialBizId = searchParams.get("businessId") || "";
  const initialBizName = searchParams.get("businessName") || "";

  const [category, setCategory] = useState<string>(
    CATEGORIES.some((c) => c.id === initialCategory) ? initialCategory : "GENERAL_MESSAGE"
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [relatedBusinessId, setRelatedBusinessId] = useState(initialBizId);
  const [relatedBusinessName, setRelatedBusinessName] = useState(initialBizName);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ name: string; size: string; url?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    referenceNumber: string;
    createdAt: string;
    category: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialCategory && CATEGORIES.some((c) => c.id === initialCategory)) {
      setCategory(initialCategory);
    }
  }, [initialCategory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    const validFiles: File[] = [];
    const previews: { name: string; size: string; url?: string }[] = [...filePreviews];

    for (const f of newFiles) {
      if (f.size > 15 * 1024 * 1024) {
        alert(`File ${f.name} exceeds 15MB maximum.`);
        continue;
      }
      validFiles.push(f);
      previews.push({
        name: f.name,
        size: (f.size / 1024 / 1024).toFixed(2) + " MB",
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      });
    }

    setFiles((prev) => [...prev, ...validFiles]);
    setFilePreviews(previews);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!subject.trim() || subject.trim().length < 3) {
      setErrorMsg("Please provide a descriptive subject (at least 3 characters).");
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setErrorMsg("Please provide your message or report details (at least 10 characters).");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("category", category);
      formData.append("subject", subject.trim());
      formData.append("message", message.trim());
      formData.append("isAnonymous", String(isAnonymous));
      if (!isAnonymous) {
        if (senderName.trim()) formData.append("senderName", senderName.trim());
        if (senderEmail.trim()) formData.append("senderEmail", senderEmail.trim());
        if (senderPhone.trim()) formData.append("senderPhone", senderPhone.trim());
      }
      if (relatedBusinessId.trim()) formData.append("relatedBusinessId", relatedBusinessId.trim());
      if (relatedBusinessName.trim()) formData.append("relatedBusinessName", relatedBusinessName.trim());
      if (honeypot) formData.append("honeypot", honeypot);

      for (const file of files) {
        formData.append("attachments", file);
      }

      const res = await fetch("/api/direct", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit message.");
      }

      setSubmittedResult({
        referenceNumber: data.referenceNumber,
        createdAt: data.createdAt,
        category: data.category,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error("[MOSA DIRECT Error]:", err);
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRef = () => {
    if (!submittedResult?.referenceNumber) return;
    navigator.clipboard.writeText(submittedResult.referenceNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const resetForm = () => {
    setSubmittedResult(null);
    setSubject("");
    setMessage("");
    setFiles([]);
    setFilePreviews([]);
    setSenderName("");
    setSenderEmail("");
    setSenderPhone("");
    setIsAnonymous(false);
    setErrorMsg(null);
  };

  const selectedCat = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 pt-8">
      {/* Background Accent Gradients */}
      <div className="absolute top-0 inset-x-0 h-80 bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-50 -z-10" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation Breadcrumb & Back */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Discovery Home</span>
          </Link>
        </div>

        {/* Hero Header */}
        <div className="text-center sm:text-left mb-10 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-3">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            <span>Official Communications Channel</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
            55 MOSA DIRECT
          </h1>
          <p className="text-lg font-bold text-emerald-400 tracking-wide mb-3">
            Your Voice. Our Attention.
          </p>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Direct, confidential channel to MOSA platform administration. Share suggestions, report incorrect
            business data or misconduct, report technical issues, or submit partnership proposals.
            Every submission is preserved in the central Command Center database.
          </p>
        </div>

        {/* Confirmation Screen */}
        {submittedResult ? (
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="text-center max-w-lg mx-auto">
              <span className="text-xs uppercase tracking-widest font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Submission Received & Sealed
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-4 mb-2">
                Thank You. Your Voice Has Been Heard.
              </h2>
              <p className="text-sm text-slate-600 mb-8 leading-relaxed">
                Your report has been securely registered in the central MOSA Global Command Center database.
                Authorized administrators have been notified for immediate triage.
              </p>

              {/* Reference Number Box */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-inner mb-6 text-left">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Official Tracking Reference</span>
                  <span className="text-emerald-400 font-mono text-[10px]">Confidential</span>
                </div>
                <div className="flex items-center justify-between gap-4 mt-2">
                  <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-amber-400">
                    {submittedResult.referenceNumber}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRef}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-300" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800">
                  Save this reference number for your records. If you provided contact details, our administration
                  team may reach out directly via your private contact channel.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Submit Another Message
                </button>
                <Link
                  href="/"
                  className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors text-center"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Submission Form */
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-slate-200 space-y-8"
          >
            {/* Error Banner */}
            {errorMsg && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Submission Notice: </span>
                  {errorMsg}
                </div>
              </div>
            )}

            {/* Hidden Honeypot Trap for Spammers */}
            <div className="hidden" aria-hidden="true">
              <input
                type="text"
                name="website_url_check"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Section 1: Choose Category */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  1. Select Submission Category <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-semibold text-slate-400">
                  Choose the category that best describes your message
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                        isSelected
                          ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                          : "bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold leading-tight ${isSelected ? "text-emerald-950" : "text-slate-900"}`}>
                            {cat.label}
                          </span>
                          {cat.badge && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                              {cat.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {cat.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Related Business Details (If applicable) */}
            {(category === "INCORRECT_INFO" || category === "FRAUD_MISCONDUCT" || relatedBusinessId || relatedBusinessName) && (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  <span>Referenced Business Profile (Optional)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={relatedBusinessName}
                      onChange={(e) => setRelatedBusinessName(e.target.value)}
                      placeholder="e.g. Janvier Retail Shop"
                      className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Business ID or Profile Link (if known)
                    </label>
                    <input
                      type="text"
                      value={relatedBusinessId}
                      onChange={(e) => setRelatedBusinessId(e.target.value)}
                      placeholder="e.g. cmhwr8n9m... or https://55mosa.com/business/..."
                      className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: Subject & Message */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                    2. Subject / Topic <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">
                    {subject.length}/200
                  </span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value.slice(0, 200))}
                  placeholder={`Brief summary of your ${selectedCat.label.toLowerCase()}...`}
                  required
                  className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-hidden transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                    3. Detailed Message & Evidence <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">
                    {message.length}/5000
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                  placeholder="Explain the situation in detail. Include dates, specific locations, what happened, or suggestions for platform enhancement..."
                  required
                  className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-hidden transition-all resize-y"
                />
              </div>
            </div>

            {/* Section 3: Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  4. Attach Evidence or Supporting Documents (Optional)
                </label>
                <span className="text-[11px] font-semibold text-slate-400">
                  Up to 15MB • Images, Screenshots, PDFs
                </span>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/30 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-emerald-100 group-hover:text-emerald-700 text-slate-500 flex items-center justify-center transition-colors mb-3">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Click to select files or drag and drop
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    PNG, JPG, WEBP, or PDF (Receipts, photos of storefront, or error screenshots)
                  </span>
                </div>
              </div>

              {/* File Previews */}
              {filePreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                  {filePreviews.map((f, idx) => (
                    <div
                      key={idx}
                      className="relative p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs"
                    >
                      {f.url ? (
                        <img src={f.url} alt={f.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <FileText className="w-8 h-8 text-slate-400 shrink-0 p-1 bg-white rounded-lg border border-slate-200" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate text-[11px]">{f.name}</p>
                        <p className="text-[10px] text-slate-400">{f.size}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Privacy & Sender Contact */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  5. Sender Identity & Privacy
                </label>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Confidential Channel</span>
                </div>
              </div>

              {/* Anonymous Toggle Option */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="anonymousCheck"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="anonymousCheck" className="text-xs text-slate-700 cursor-pointer">
                  <span className="font-black text-slate-900 block">
                    Submit this report anonymously
                  </span>
                  <span className="text-slate-500 text-[11px] leading-relaxed block mt-0.5">
                    Your name and contact information will be completely omitted from the central record.
                    (Note: When submitting anonymously, MOSA staff cannot follow up privately with status updates).
                  </span>
                </label>
              </div>

              {/* Contact Fields (Hidden if Anonymous) */}
              {!isAnonymous && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Your Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="e.g. Marie Claire"
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Email Address (For private response)
                    </label>
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="e.g. marie@example.com"
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      placeholder="e.g. +250 788 123 456"
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Encrypted transit • Never posted publicly • Database-backed audit trail</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  submitting
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] shadow-emerald-600/20"
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Transmitting to Command Center...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit to MOSA Administration</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Informational Guidance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-slate-600 text-xs">
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              100% Private & Protected
            </h4>
            <p className="leading-relaxed text-slate-500 text-[11px]">
              MOSA DIRECT is not a public message board. Every report is encrypted and routed exclusively to
              authorized administrators inside the Global Command Center.
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Fraud & Integrity Action
            </h4>
            <p className="leading-relaxed text-slate-500 text-[11px]">
              Reports regarding extortion, payment diversion, impersonation, or fake business locations are
              automatically flagged for priority investigation.
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Handshake className="w-4 h-4 text-amber-600" />
              Community Partnership
            </h4>
            <p className="leading-relaxed text-slate-500 text-[11px]">
              We welcome collaboration with grassroots cooperatives, local market committees, developers, and civic
              organizations in every supported country.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function MosaDirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              Loading 55 MOSA DIRECT...
            </p>
          </div>
        </div>
      }
    >
      <MosaDirectForm />
    </Suspense>
  );
}
