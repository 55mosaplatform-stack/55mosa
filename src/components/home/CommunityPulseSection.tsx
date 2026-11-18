"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { Megaphone, Store, ChevronRight, Clock, MapPin, ShieldCheck, Tag } from "lucide-react";

interface CommunityPostItem {
  id: string;
  sourceModel: string;
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
  businessSector?: string | null;
  businessCell?: string | null;
  businessLogo?: string | null;
  createdAt: string;
}

export function CommunityPulseSection() {
  const { lang } = useLanguage();
  const [posts, setPosts] = useState<CommunityPostItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLatestPosts() {
      try {
        const res = await fetch("/api/community/posts?limit=3", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts || []);
        }
      } catch (err) {
        console.warn("[CommunityPulseSection] Failed to load latest posts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadLatestPosts();
  }, []);

  if (!loading && posts.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 pt-12 border-t border-slate-200/80">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold uppercase tracking-wider mb-2">
            <Megaphone className="w-3.5 h-3.5 text-amber-700" />
            <span>{lang === "rw" ? "Amakuru n'Amatangazo ya Kominote" : "Community Radar & Live Directives"}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
            {lang === "rw" ? "Amatangazo n'Amakuru Bigezweho" : "Latest Announcements & Local Pulse"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {lang === "rw"
              ? "Amatangazo y'ubuyobozi n'amakuru y'ubucuruzi bwemejwe atangazwa mu buryo bw'ako kanya."
              : "Real-time directives, enterprise offers, and notices synchronized directly with the platform database."}
          </p>
        </div>

        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2.5 rounded-full transition-colors shrink-0"
        >
          <span>{lang === "rw" ? "Reba Amatangazo Yose" : "View All Announcements"}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {posts.map((post) => {
          const isOfficial = post.sourceModel === "ANNOUNCEMENT";
          const dateStr = new Date(post.createdAt).toLocaleDateString(lang === "rw" ? "rw-RW" : "en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={post.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isOfficial
                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                        : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                    }`}
                  >
                    {post.badge || (isOfficial ? "OFFICIAL" : "UPDATE")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{dateStr}</span>
                  </span>
                </div>

                <h3 className="font-extrabold text-slate-900 text-sm leading-snug line-clamp-2 mb-1.5">
                  {lang === "rw" ? (post.titleRw || post.title) : post.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  {lang === "rw" ? (post.contentRw || post.content) : post.content}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 text-[11px] truncate max-w-[180px]">
                  {post.businessName || post.authorName}
                </span>

                <Link
                  href="/community"
                  className="text-emerald-700 hover:text-emerald-800 font-bold text-[11px] flex items-center gap-0.5 shrink-0"
                >
                  <span>{lang === "rw" ? "Soma" : "Read"}</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
