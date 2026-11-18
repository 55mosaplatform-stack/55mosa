"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { usePlatformSettings } from "@/lib/platform-context";
import { 
  Megaphone, 
  Store, 
  Tag, 
  Calendar, 
  MapPin, 
  Share2, 
  Plus, 
  RefreshCw, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  AlertCircle, 
  ArrowRight, 
  Search, 
  Filter, 
  MessageSquare, 
  Building2,
  X,
  Upload,
  Image as ImageIcon,
  Clock,
  Layers,
  ChevronRight
} from "lucide-react";

interface CommunityPost {
  id: string;
  sourceModel: "ANNOUNCEMENT" | "BUSINESS_UPDATE" | "OFFER";
  type: string;
  title: string;
  titleRw?: string | null;
  content: string;
  contentRw?: string | null;
  badge?: string | null;
  imageUrl?: string | null;
  authorName: string;
  authorRole: string;
  businessId?: string | null;
  businessName?: string | null;
  businessCategory?: string | null;
  businessSector?: string | null;
  businessCell?: string | null;
  businessLogo?: string | null;
  validUntil?: string | null;
  createdAt: string;
}

export default function CommunityPage() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { settings } = usePlatformSettings();

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"all" | "announcements" | "updates" | "offers">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formType, setFormType] = useState<string>("ANNOUNCEMENT");
  const [formBadge, setFormBadge] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");

  const isAuthorizedPublisher = Boolean(
    user && ["SUPER_ADMIN", "COMMUNITY_ADMIN", "MODERATOR", "BUSINESS_OWNER", "COMMUNITY_AGENT"].includes(user.role)
  );

  async function loadPosts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("type", activeTab);
      const res = await fetch(`/api/community/posts?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error("Failed to load community posts:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, [activeTab]);

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      setFeedbackMsg({ type: "error", text: lang === "rw" ? "Umutwe n'ubutumwa birakenewe." : "Title and message are required." });
      return;
    }

    try {
      setSubmitting(true);
      setFeedbackMsg(null);

      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim(),
          type: formType,
          badge: formBadge.trim() || undefined,
          imageUrl: formImageUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackMsg({
          type: "success",
          text: lang === "rw" ? "Ubutumwa bwashyizwe ahagaragara neza!" : "Post published successfully!",
        });
        setFormTitle("");
        setFormContent("");
        setFormBadge("");
        setFormImageUrl("");
        setTimeout(() => {
          setCreateModalOpen(false);
          setFeedbackMsg(null);
          loadPosts();
        }, 1200);
      } else {
        setFeedbackMsg({ type: "error", text: data.error || "Failed to publish post." });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredPosts = posts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.businessName && p.businessName.toLowerCase().includes(q)) ||
      (p.businessSector && p.businessSector.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24">
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-slate-950 text-white pt-12 sm:pt-16 pb-16 sm:pb-20 border-b border-slate-900">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
                <Megaphone className="w-3.5 h-3.5" />
                <span>{lang === "rw" ? "Amakuru n'Amatangazo y'Abaturage" : "Community & Enterprise Radar"}</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                {lang === "rw" ? "Ihuriro ry'Amakuru n'Amatangazo" : "Community Voice & Enterprise Updates"}
              </h1>
              <p className="mt-3 text-base sm:text-lg text-slate-300">
                {lang === "rw"
                  ? "Amatangazo y'ubuyobozi, amakuru y'ubucuruzi bwemejwe, amaporomosiyo n'ibikorwa bigezweho muri kominote."
                  : "Official platform directives, verified enterprise announcements, exclusive local promotions, and live community activities."}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={loadPosts}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer border border-white/10"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>{lang === "rw" ? "Kuvugurura" : "Refresh"}</span>
              </button>

              {isAuthorizedPublisher && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{lang === "rw" ? "Tanga Itangazo" : "Post Update / Notice"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Navigation Tabs & Search Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
            {[
              { id: "all", label: lang === "rw" ? "Byose Hamwe" : "All Updates" },
              { id: "announcements", label: lang === "rw" ? "Amatangazo Akomeye" : "Official Notices" },
              { id: "updates", label: lang === "rw" ? "Amakuru y'Ubucuruzi" : "Business Updates" },
              { id: "offers", label: lang === "rw" ? "Poromosiyo & Ibiciro" : "Offers & Discounts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-emerald-800 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={lang === "rw" ? "Shakisha mu makuru..." : "Search posts & businesses..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Feed List */}
        <div className="pt-8">
          {loading ? (
            <div className="text-center py-24">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">
                {lang === "rw" ? "Turimo gukuramo amakuru y'ukuri..." : "Loading live community broadcasts..."}
              </p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-card">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Megaphone className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {lang === "rw" ? "Nta makuru ahari ubu muri iki cyiciro" : "No community posts in this category yet"}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {lang === "rw"
                  ? "Amatangazo mashya n'amakuru y'ubucuruzi azashyirwa hano ako kanya."
                  : "New official directives and approved business notices will appear here automatically in real time."}
              </p>
              {activeTab !== "all" && (
                <button
                  onClick={() => setActiveTab("all")}
                  className="mt-5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
                >
                  {lang === "rw" ? "Reba Byose Hamwe" : "View All Community Updates"}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post) => {
                const isOfficial = post.sourceModel === "ANNOUNCEMENT";
                const isOffer = post.sourceModel === "OFFER";
                const dateStr = new Date(post.createdAt).toLocaleDateString(lang === "rw" ? "rw-RW" : "en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <article
                    key={post.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-card hover:shadow-lg transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    <div>
                      {/* Image header if available */}
                      {post.imageUrl && (
                        <div className="w-full h-48 bg-slate-100 relative overflow-hidden">
                          <img
                            src={post.imageUrl}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}

                      <div className="p-6">
                        {/* Post Header / Badges */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isOfficial
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : isOffer
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                : "bg-blue-100 text-blue-900 border border-blue-200"
                            }`}
                          >
                            {post.badge || (isOfficial ? "OFFICIAL" : "UPDATE")}
                          </span>

                          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{dateStr}</span>
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-extrabold text-slate-950 text-base sm:text-lg leading-snug tracking-tight mb-2">
                          {lang === "rw" ? (post.titleRw || post.title) : post.title}
                        </h3>

                        {/* Content */}
                        <p className="text-xs sm:text-sm text-slate-600 line-clamp-4 leading-relaxed whitespace-pre-line">
                          {lang === "rw" ? (post.contentRw || post.content) : post.content}
                        </p>
                      </div>
                    </div>

                    {/* Author / Business Footer */}
                    <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {post.businessLogo ? (
                          <img
                            src={post.businessLogo}
                            alt={post.businessName || "Business"}
                            className="w-8 h-8 rounded-xl object-contain bg-white p-0.5 border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {isOfficial ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <Store className="w-4 h-4 text-slate-300" />}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-900 truncate">
                            {post.businessName || post.authorName}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                            {post.businessSector ? (
                              <>
                                <MapPin className="w-2.5 h-2.5 text-emerald-700" />
                                <span>{post.businessSector}{post.businessCell ? `, ${post.businessCell}` : ""}</span>
                              </>
                            ) : (
                              <span>{isOfficial ? "55 MOSA Platform Governance" : post.authorRole}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {post.businessId && (
                        <Link
                          href={`/business/${post.businessId}`}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 hover:border-emerald-200 text-[11px] font-bold transition shrink-0 flex items-center gap-1"
                        >
                          <span>{lang === "rw" ? "Reba" : "View"}</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* In-Page Publishing Modal for Authorized Publishers */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {lang === "rw" ? "Shyiraho Itangazo / Amakuru" : "Publish Community Post"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {lang === "rw" ? "Rizahita rigaragara kuri 55mosa.com" : "Will appear live on 55mosa.com immediately"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 mx-6 mt-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  feedbackMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {feedbackMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleCreatePost} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === "rw" ? "Umutwe w'Itangazo" : "Post Title"} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={lang === "rw" ? "Urugero: Poromosiyo nshya, Imirimo, Itangazo..." : "e.g., Weekend Special, New Arrivals, Public Notice..."}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {lang === "rw" ? "Ubwoko bw'Itangazo" : "Post Type"}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-slate-900 text-xs cursor-pointer"
                  >
                    <option value="ANNOUNCEMENT">Announcement / Itangazo</option>
                    <option value="NEW_ARRIVAL">New Arrival / Ibicuruzwa Bishya</option>
                    <option value="OFFER">Special Offer / Poromosiyo</option>
                    <option value="SERVICE_UPDATE">Service Update / Amavugurura</option>
                    <option value="IMPORTANT_NOTICE">Public Notice / Imburamuryango</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {lang === "rw" ? "Ikirango (Badge)" : "Badge / Ribbon Tag"}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 20% OFF, NOTICE, EVENT"
                    value={formBadge}
                    onChange={(e) => setFormBadge(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === "rw" ? "Ubutumwa n'Ibisobanuro" : "Content / Message Body"} *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={lang === "rw" ? "Andika hano ubutumwa burambuye..." : "Write detailed announcement or news..."}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-slate-900 text-xs resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === "rw" ? "Ifoto y'Itangazo (URL)" : "Image / Photo URL (Optional)"}
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-slate-900 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  {lang === "rw" ? "Kureka" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{lang === "rw" ? "Tangaza None Aha" : "Publish to Community"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
