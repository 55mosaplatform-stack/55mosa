"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Inbox,
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
  MapPinOff,
  Wrench,
  Handshake,
  Mail,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  User,
  Phone,
  Paperclip,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Lock,
  Eye,
  Check,
  Send,
  Building2,
  Tag,
  UserCheck,
  Flag,
  Calendar,
  AlertCircle
} from "lucide-react";

interface MosaDirectItem {
  id: string;
  referenceNumber: string;
  category: string;
  subject: string;
  message: string;
  isAnonymous: boolean;
  senderName?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  senderCountry?: string | null;
  relatedBusinessId?: string | null;
  relatedBusinessName?: string | null;
  attachments: string[];
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "NEW" | "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  isRead: boolean;
  readAt?: string | null;
  assignedToId?: string | null;
  assignedTo?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role: string;
  } | null;
  adminNotes?: string | null;
  responseHistory?: Array<{
    id: string;
    text: string;
    channel: string;
    respondedAt: string;
    respondedByName: string;
    respondedById: string;
  }> | null;
  createdAt: string;
  updatedAt: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  SUGGESTION: { label: "Suggestion", icon: Lightbulb, color: "text-amber-500 bg-amber-50 border-amber-200" },
  COMPLAINT_FEEDBACK: { label: "Complaint", icon: AlertTriangle, color: "text-orange-500 bg-orange-50 border-orange-200" },
  INCORRECT_INFO: { label: "Incorrect Info", icon: MapPinOff, color: "text-blue-500 bg-blue-50 border-blue-200" },
  FRAUD_MISCONDUCT: { label: "Fraud / Misconduct", icon: ShieldAlert, color: "text-rose-500 bg-rose-50 border-rose-200" },
  TECHNICAL_ISSUE: { label: "Tech Issue", icon: Wrench, color: "text-slate-600 bg-slate-100 border-slate-300" },
  PARTNERSHIP: { label: "Partnership", icon: Handshake, color: "text-emerald-500 bg-emerald-50 border-emerald-200" },
  GENERAL_MESSAGE: { label: "General", icon: Mail, color: "text-indigo-500 bg-indigo-50 border-indigo-200" },
};

const PRIORITY_META: Record<string, { label: string; badgeClass: string }> = {
  LOW: { label: "Low", badgeClass: "bg-slate-100 text-slate-600 border-slate-200" },
  NORMAL: { label: "Normal", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  HIGH: { label: "High", badgeClass: "bg-orange-50 text-orange-700 border-orange-200 font-bold" },
  URGENT: { label: "URGENT", badgeClass: "bg-rose-100 text-rose-800 border-rose-300 font-black animate-pulse" },
};

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  NEW: { label: "New", badgeClass: "bg-amber-100 text-amber-900 border-amber-300 font-bold" },
  UNDER_REVIEW: { label: "Under Review", badgeClass: "bg-purple-100 text-purple-800 border-purple-200" },
  IN_PROGRESS: { label: "In Progress", badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
  RESOLVED: { label: "Resolved", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  CLOSED: { label: "Closed", badgeClass: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function MosaDirectInboxTab({
  onUnreadCountChange,
}: {
  onUnreadCountChange?: (count: number) => void;
}) {
  const [submissions, setSubmissions] = useState<MosaDirectItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MosaDirectItem | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [readFilter, setReadFilter] = useState("ALL");

  // Metrics summary
  const [metrics, setMetrics] = useState({
    totalSubmissions: 0,
    newUnreadCount: 0,
    urgentCount: 0,
    inProgressCount: 0,
    resolvedCount: 0,
    categoryBreakdown: {} as Record<string, number>,
    statusBreakdown: {} as Record<string, number>,
  });

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseChannel, setResponseChannel] = useState<"EMAIL" | "INTERNAL_NOTE" | "SMS">("EMAIL");
  const [editingNotes, setEditingNotes] = useState("");
  const [isNotesEditing, setIsNotesEditing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchInbox = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (categoryFilter !== "ALL") params.append("category", categoryFilter);
      if (priorityFilter !== "ALL") params.append("priority", priorityFilter);
      if (countryFilter !== "ALL") params.append("country", countryFilter);
      if (readFilter !== "ALL") params.append("isRead", readFilter);
      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      params.append("limit", "100");

      const res = await fetch(`/api/admin/direct?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load MOSA DIRECT inbox.");
      }
      const data = await res.json();
      setSubmissions(data.submissions || []);
      setMetrics(data.metrics || metrics);
      setStaffList(data.assignableStaff || []);

      if (onUnreadCountChange && data.metrics?.newUnreadCount !== undefined) {
        onUnreadCountChange(data.metrics.newUnreadCount);
      }

      // Keep selected item synced
      if (selectedItem) {
        const found = (data.submissions || []).find((s: MosaDirectItem) => s.id === selectedItem.id);
        if (found) {
          setSelectedItem(found);
          setEditingNotes(found.adminNotes || "");
        }
      } else if (data.submissions && data.submissions.length > 0) {
        setSelectedItem(data.submissions[0]);
        setEditingNotes(data.submissions[0].adminNotes || "");
      }
    } catch (err: any) {
      console.error("[Inbox Fetch Error]:", err);
      setError(err.message || "Failed to load submissions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, [statusFilter, categoryFilter, priorityFilter, countryFilter, readFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInbox();
  };

  const handleSelectItem = async (item: MosaDirectItem) => {
    setSelectedItem(item);
    setEditingNotes(item.adminNotes || "");
    setIsNotesEditing(false);
    setActionSuccessMsg(null);

    // If item was unread, automatically mark as read
    if (!item.isRead) {
      try {
        await fetch("/api/admin/direct", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, isRead: true }),
        });
        setSubmissions((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, isRead: true } : s))
        );
        setSelectedItem((prev) => (prev?.id === item.id ? { ...prev, isRead: true } : prev));
        setMetrics((prev) => ({
          ...prev,
          newUnreadCount: Math.max(0, prev.newUnreadCount - 1),
        }));
        if (onUnreadCountChange) {
          onUnreadCountChange(Math.max(0, metrics.newUnreadCount - 1));
        }
      } catch (err) {
        console.warn("Error marking read:", err);
      }
    }
  };

  const handleStatusUpdate = async (newStatus: MosaDirectItem["status"]) => {
    if (!selectedItem) return;
    setActionLoading(true);
    setActionSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedItem.id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status.");

      setSelectedItem(data.submission);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? data.submission : s))
      );
      setActionSuccessMsg(`Status updated to ${newStatus}.`);
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePriorityUpdate = async (newPriority: MosaDirectItem["priority"]) => {
    if (!selectedItem) return;
    setActionLoading(true);
    setActionSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedItem.id, priority: newPriority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update priority.");

      setSelectedItem(data.submission);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? data.submission : s))
      );
      setActionSuccessMsg(`Priority updated to ${newPriority}.`);
    } catch (err: any) {
      alert(err.message || "Failed to update priority.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssigneeUpdate = async (staffId: string) => {
    if (!selectedItem) return;
    setActionLoading(true);
    setActionSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedItem.id,
          assignedToId: staffId === "UNASSIGNED" ? null : staffId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign staff.");

      setSelectedItem(data.submission);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? data.submission : s))
      );
      setActionSuccessMsg("Assigned staff updated.");
    } catch (err: any) {
      alert(err.message || "Failed to update assignment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedItem) return;
    setActionLoading(true);
    setActionSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedItem.id, adminNotes: editingNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save notes.");

      setSelectedItem(data.submission);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? data.submission : s))
      );
      setIsNotesEditing(false);
      setActionSuccessMsg("Internal notes saved.");
    } catch (err: any) {
      alert(err.message || "Failed to save notes.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !responseText.trim()) return;

    setActionLoading(true);
    setActionSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedItem.id,
          newResponse: {
            text: responseText.trim(),
            channel: responseChannel,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record response.");

      setSelectedItem(data.submission);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? data.submission : s))
      );
      setResponseText("");
      setActionSuccessMsg("Response recorded in history.");
    } catch (err: any) {
      alert(err.message || "Failed to record response.");
    } finally {
      setActionLoading(false);
    }
  };

  // Distinct countries present in submissions for filter
  const availableCountries = useMemo(() => {
    const s = new Set<string>();
    submissions.forEach((item) => {
      if (item.senderCountry) s.add(item.senderCountry.toUpperCase());
    });
    return Array.from(s).sort();
  }, [submissions]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner & Metrics Row */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  MOSA DIRECT INBOX
                </h2>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Global Triage Console
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Your Voice. Our Attention. Centralized database repository for confidential user reports and feedback.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchInbox(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-600" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Real-time Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Submissions</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{metrics.totalSubmissions}</div>
            <div className="text-[10px] text-slate-400 mt-1">All-time DB records</div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
              <span>New & Unread</span>
              {metrics.newUnreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">{metrics.newUnreadCount}</div>
            <div className="text-[10px] text-amber-700 mt-1 font-semibold">Requires triage</div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200">
            <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center justify-between">
              <span>Urgent Priority</span>
              {metrics.urgentCount > 0 && <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />}
            </div>
            <div className="text-2xl font-black text-rose-900 mt-1">{metrics.urgentCount}</div>
            <div className="text-[10px] text-rose-700 mt-1 font-semibold">Fraud / Security alerts</div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
            <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">In Progress</div>
            <div className="text-2xl font-black text-blue-900 mt-1">{metrics.inProgressCount}</div>
            <div className="text-[10px] text-blue-700 mt-1">Under staff investigation</div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Resolved / Closed</div>
            <div className="text-2xl font-black text-emerald-900 mt-1">{metrics.resolvedCount}</div>
            <div className="text-[10px] text-emerald-700 mt-1 font-semibold">Successfully concluded</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference #, subject, sender, phone, email, or business name..."
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1 text-slate-500 font-bold mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="SUGGESTION">💡 Suggestions</option>
            <option value="COMPLAINT_FEEDBACK">⚠️ Complaints</option>
            <option value="INCORRECT_INFO">📍 Incorrect Info</option>
            <option value="FRAUD_MISCONDUCT">🛡️ Fraud / Misconduct</option>
            <option value="TECHNICAL_ISSUE">🛠️ Technical Bug</option>
            <option value="PARTNERSHIP">🤝 Partnerships</option>
            <option value="GENERAL_MESSAGE">✉️ General Messages</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">🔥 Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>

          {/* Country Filter */}
          {availableCountries.length > 0 && (
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Countries</option>
              {availableCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Read/Unread Filter */}
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Read States</option>
            <option value="false">Unread Only</option>
            <option value="true">Read Only</option>
          </select>

          {(statusFilter !== "ALL" || categoryFilter !== "ALL" || priorityFilter !== "ALL" || countryFilter !== "ALL" || readFilter !== "ALL" || searchTerm) && (
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setCategoryFilter("ALL");
                setPriorityFilter("ALL");
                setCountryFilter("ALL");
                setReadFilter("ALL");
                setSearchTerm("");
              }}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Master-Detail Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Submissions List (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Submissions Queue ({submissions.length})</span>
            <span className="text-[11px] font-normal text-slate-400">Sorted by Priority & Date</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading && submissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Loading submissions...</span>
              </div>
            ) : submissions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-bold text-slate-700">No submissions found</p>
                <p className="text-[11px] text-slate-400 mt-1">Try adjusting your filters or search keywords.</p>
              </div>
            ) : (
              submissions.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const catInfo = CATEGORY_META[item.category] || CATEGORY_META.GENERAL_MESSAGE;
                const CatIcon = catInfo.icon;
                const prioInfo = PRIORITY_META[item.priority] || PRIORITY_META.NORMAL;
                const statusInfo = STATUS_META[item.status] || STATUS_META.NEW;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`w-full text-left p-4 transition-all flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50/80 border-l-4 border-l-emerald-600"
                        : !item.isRead
                        ? "bg-amber-50/40 hover:bg-slate-50 font-semibold"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Unread indicator / Category Icon */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${catInfo.color}`}>
                        <CatIcon className="w-4 h-4" />
                      </div>
                      {!item.isRead && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          {item.referenceNumber}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 truncate mb-1">
                        {item.subject}
                      </h4>

                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-2">
                        {item.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className={`px-2 py-0.5 rounded-full border ${prioInfo.badgeClass}`}>
                          {prioInfo.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                        {item.isAnonymous ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            🔒 Anonymous
                          </span>
                        ) : (
                          <span className="text-slate-600 truncate max-w-[120px]">
                            {item.senderName || item.senderEmail || "Identified"}
                          </span>
                        )}
                        {item.attachments.length > 0 && (
                          <span className="text-slate-400 flex items-center gap-0.5">
                            <Paperclip className="w-3 h-3" />
                            <span>{item.attachments.length}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Submission Detail Inspector (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6 min-h-[750px]">
          {selectedItem ? (
            <div className="space-y-6">
              
              {/* Header: Title, Reference, Priority & Status */}
              <div className="pb-5 border-b border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-amber-900 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                      {selectedItem.referenceNumber}
                    </span>
                    <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${PRIORITY_META[selectedItem.priority]?.badgeClass}`}>
                      {PRIORITY_META[selectedItem.priority]?.label}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${STATUS_META[selectedItem.status]?.badgeClass}`}>
                      {STATUS_META[selectedItem.status]?.label}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(selectedItem.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <h3 className="text-lg font-black text-slate-900 leading-snug">
                  {selectedItem.subject}
                </h3>

                {/* Status Triage Controls */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span>Move Status:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["NEW", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={actionLoading || selectedItem.status === st}
                        onClick={() => handleStatusUpdate(st)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          selectedItem.status === st
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {STATUS_META[st].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority Selector & Assignee Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Flag Priority:</span>
                    <select
                      value={selectedItem.priority}
                      onChange={(e) => handlePriorityUpdate(e.target.value as any)}
                      disabled={actionLoading}
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold cursor-pointer"
                    >
                      <option value="URGENT">🔥 URGENT</option>
                      <option value="HIGH">High</option>
                      <option value="NORMAL">Normal</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Assign Staff:</span>
                    <select
                      value={selectedItem.assignedToId || "UNASSIGNED"}
                      onChange={(e) => handleAssigneeUpdate(e.target.value)}
                      disabled={actionLoading}
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold cursor-pointer max-w-[160px]"
                    >
                      <option value="UNASSIGNED">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role.replace("_", " ")})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {actionSuccessMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{actionSuccessMsg}</span>
                  </div>
                )}
              </div>

              {/* Complete Message Content */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Full Report Details
                </span>
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                  {selectedItem.message}
                </div>
              </div>

              {/* Sender Profile & Privacy Notice */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <span className="font-black uppercase tracking-wider text-slate-700 block text-[11px]">
                  Sender Identity & Channel Details
                </span>

                {selectedItem.isAnonymous ? (
                  <div className="flex items-center gap-2 text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                    <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px] leading-relaxed">
                      <strong>Anonymous Submission:</strong> The sender chose not to disclose identifying contact information.
                      Client IP was hashed with salted SHA-256 for spam defense.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Sender Name</span>
                      <span className="font-bold text-slate-900">{selectedItem.senderName || "Not provided"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Email Address</span>
                      {selectedItem.senderEmail ? (
                        <a
                          href={`mailto:${selectedItem.senderEmail}?subject=Re: [${selectedItem.referenceNumber}] ${encodeURIComponent(selectedItem.subject)}`}
                          className="font-bold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{selectedItem.senderEmail}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Phone Number</span>
                      {selectedItem.senderPhone ? (
                        <a
                          href={`tel:${selectedItem.senderPhone}`}
                          className="font-bold text-slate-800 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{selectedItem.senderPhone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </div>
                  </div>
                )}
                {selectedItem.senderCountry && (
                  <div className="text-[10px] text-slate-500 pt-1">
                    Detected Geolocation Hub: <strong>{selectedItem.senderCountry}</strong>
                  </div>
                )}
              </div>

              {/* Referenced Business (If applicable) */}
              {(selectedItem.relatedBusinessId || selectedItem.relatedBusinessName) && (
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2 text-xs">
                  <span className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-700" />
                    <span>Referenced Business</span>
                  </span>
                  <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-200">
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">
                        {selectedItem.relatedBusinessName || "Referenced Business"}
                      </span>
                      {selectedItem.relatedBusinessId && (
                        <span className="font-mono text-[10px] text-slate-400">
                          ID: {selectedItem.relatedBusinessId}
                        </span>
                      )}
                    </div>
                    {selectedItem.relatedBusinessId && (
                      <a
                        href={`/business/${selectedItem.relatedBusinessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs flex items-center gap-1 transition-colors"
                      >
                        <span>View Business</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments Section */}
              {selectedItem.attachments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Attached Evidence ({selectedItem.attachments.length})</span>
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedItem.attachments.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center gap-2 text-xs text-slate-800 group"
                      >
                        <Eye className="w-4 h-4 text-emerald-600 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate font-semibold">Evidence File #{idx + 1}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal Administration Notes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Internal Staff Coordination Notes
                  </span>
                  {!isNotesEditing && (
                    <button
                      type="button"
                      onClick={() => setIsNotesEditing(true)}
                      className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      {selectedItem.adminNotes ? "Edit Notes" : "+ Add Note"}
                    </button>
                  )}
                </div>

                {isNotesEditing ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Add confidential notes for MOSA administration regarding this report..."
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNotesEditing(false);
                          setEditingNotes(selectedItem.adminNotes || "");
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={handleSaveNotes}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 cursor-pointer"
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 italic">
                    {selectedItem.adminNotes || "No internal staff notes recorded yet."}
                  </div>
                )}
              </div>

              {/* Response History & Private Follow-up */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Response & Action History</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {Array.isArray(selectedItem.responseHistory) ? selectedItem.responseHistory.length : 0} entries
                  </span>
                </div>

                {/* Thread of Responses */}
                {Array.isArray(selectedItem.responseHistory) && selectedItem.responseHistory.length > 0 && (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {selectedItem.responseHistory.map((resp) => (
                      <div
                        key={resp.id}
                        className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-bold text-indigo-900">
                            {resp.respondedByName} ({resp.channel})
                          </span>
                          <span>{new Date(resp.respondedAt).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-800 leading-relaxed font-sans">{resp.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Private Response Composer */}
                <form onSubmit={handleSendResponse} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Record Action / Private Follow-up</span>
                    <div className="flex items-center gap-1">
                      <select
                        value={responseChannel}
                        onChange={(e) => setResponseChannel(e.target.value as any)}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-bold"
                      >
                        <option value="EMAIL">Email Response</option>
                        <option value="INTERNAL_NOTE">Internal Triage Note</option>
                        <option value="SMS">SMS Dispatch Note</option>
                      </select>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder={
                      selectedItem.senderEmail
                        ? `Record email response sent to ${selectedItem.senderEmail}...`
                        : "Record internal resolution summary or action taken..."
                    }
                    className="w-full p-3 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {selectedItem.senderEmail
                        ? "Saved to immutable audit trail and history."
                        : "Sender is anonymous; recorded as internal resolution log."}
                    </span>
                    <button
                      type="submit"
                      disabled={actionLoading || !responseText.trim()}
                      className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer ${
                        actionLoading || !responseText.trim()
                          ? "bg-slate-300 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Log Response</span>
                    </button>
                  </div>
                </form>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-24 text-center">
              <Inbox className="w-12 h-12 text-slate-300 mb-3" />
              <p className="font-bold text-slate-700 text-sm">Select a submission</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Choose any item from the left queue to view full report details, inspect attachments, and triage status.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
