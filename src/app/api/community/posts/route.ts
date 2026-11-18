import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { Role, BusinessUpdateType } from "@prisma/client";

export const dynamic = "force-dynamic";

export interface UnifiedPost {
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
  authorId?: string | null;
  businessId?: string | null;
  businessName?: string | null;
  businessCategory?: string | null;
  businessSector?: string | null;
  businessCell?: string | null;
  businessLogo?: string | null;
  targetType?: string;
  validUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/community/posts
 * Public endpoint to fetch real-time community announcements, enterprise news, offers, and events.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type") || "all";
  const sector = searchParams.get("sector") || undefined;
  const district = searchParams.get("district") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  try {
    const unifiedPosts: UnifiedPost[] = [];

    // 1. Fetch Partner Announcements (Platform Notices, Governance, Public Directives)
    if (typeFilter === "all" || typeFilter === "announcements" || typeFilter === "notices") {
      const announcements = await prisma.partnerAnnouncement.findMany({
        where: {
          status: { in: ["SENT", "PUBLISHED", "SCHEDULED"] },
          ...(district && district !== "all" ? {
            OR: [
              { targetType: "ALL" },
              { targetDistrict: { equals: district, mode: "insensitive" } },
            ],
          } : {}),
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      for (const a of announcements) {
        unifiedPosts.push({
          id: a.id,
          sourceModel: "ANNOUNCEMENT",
          type: a.targetType === "ALL" ? "OFFICIAL_ANNOUNCEMENT" : "TARGETED_NOTICE",
          title: a.title,
          titleRw: a.titleRw || a.title,
          content: a.message,
          contentRw: a.messageRw || a.message,
          badge: "OFFICIAL NOTICE",
          imageUrl: null,
          authorName: a.author?.name || "55 MOSA Platform Administration",
          authorRole: a.author?.role || "SUPER_ADMIN",
          authorId: a.authorId,
          targetType: a.targetType,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        });
      }
    }

    // 2. Fetch Business Updates (Announcements, New Arrivals, Activities, Notices)
    if (typeFilter === "all" || typeFilter === "updates" || typeFilter === "news" || typeFilter === "events") {
      const updates = await prisma.businessUpdate.findMany({
        where: {
          status: "ACTIVE",
          moderationStatus: { not: "REMOVED" },
          business: {
            status: "ACTIVE",
            ...(sector && sector !== "all" ? { sector: { equals: sector, mode: "insensitive" } } : {}),
            ...(district && district !== "all" ? { district: { equals: district, mode: "insensitive" } } : {}),
          },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          business: {
            select: {
              id: true,
              name: true,
              nameRw: true,
              category: true,
              categoryDisplay: true,
              sector: true,
              cell: true,
              logo: true,
              coverImage: true,
            },
          },
        },
      });

      for (const u of updates) {
        unifiedPosts.push({
          id: u.id,
          sourceModel: "BUSINESS_UPDATE",
          type: u.type,
          title: u.title,
          titleRw: u.titleRw || u.title,
          content: u.content,
          contentRw: u.contentRw || u.content,
          badge: u.badge || (u.type === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : u.type.replace(/_/g, " ")),
          imageUrl: u.imageUrl,
          authorName: u.business.name,
          authorRole: "BUSINESS_OWNER",
          businessId: u.business.id,
          businessName: u.business.name,
          businessCategory: u.business.categoryDisplay || u.business.category,
          businessSector: u.business.sector,
          businessCell: u.business.cell,
          businessLogo: u.business.logo || u.business.coverImage,
          validUntil: u.validUntil ? u.validUntil.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        });
      }
    }

    // 3. Fetch Enterprise Offers & Discounts
    if (typeFilter === "all" || typeFilter === "offers") {
      const offers = await prisma.offer.findMany({
        where: {
          status: "ACTIVE",
          business: {
            status: "ACTIVE",
            ...(sector && sector !== "all" ? { sector: { equals: sector, mode: "insensitive" } } : {}),
            ...(district && district !== "all" ? { district: { equals: district, mode: "insensitive" } } : {}),
          },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          business: {
            select: {
              id: true,
              name: true,
              nameRw: true,
              category: true,
              categoryDisplay: true,
              sector: true,
              cell: true,
              logo: true,
              coverImage: true,
            },
          },
        },
      });

      for (const o of offers) {
        unifiedPosts.push({
          id: o.id,
          sourceModel: "OFFER",
          type: "SPECIAL_OFFER",
          title: o.title,
          titleRw: o.titleRw || o.title,
          content: o.description || `Special promotion: ${o.discount} discount available at ${o.business.name}`,
          contentRw: o.descriptionRw || o.description,
          badge: o.discount || "SPECIAL OFFER",
          imageUrl: null,
          authorName: o.business.name,
          authorRole: "BUSINESS_OWNER",
          businessId: o.business.id,
          businessName: o.business.name,
          businessCategory: o.business.categoryDisplay || o.business.category,
          businessSector: o.business.sector,
          businessCell: o.business.cell,
          businessLogo: o.business.logo || o.business.coverImage,
          validUntil: o.validUntil ? o.validUntil.toISOString() : null,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.createdAt.toISOString(),
        });
      }
    }

    // Sort unified feed chronologically (newest first)
    unifiedPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      count: unifiedPosts.length,
      posts: unifiedPosts.slice(0, limit),
    }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("[Community Posts GET Error]:", error);
    return NextResponse.json({
      error: "Failed to load community posts",
      details: error.message,
    }, { status: 500 });
  }
}

/**
 * POST /api/community/posts
 * Authenticated publishing endpoint for administrators, partners, and registered business owners.
 */
export async function POST(request: Request) {
  const auth = await requireAuth([
    Role.SUPER_ADMIN,
    Role.COMMUNITY_ADMIN,
    Role.MODERATOR,
    Role.BUSINESS_OWNER,
    Role.COMMUNITY_AGENT,
  ]);

  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const user = auth.user;

  try {
    const body = await request.json();
    const {
      title,
      titleRw,
      content,
      contentRw,
      type = "ANNOUNCEMENT",
      badge,
      imageUrl,
      businessId,
      validUntil,
      targetType = "ALL",
      targetDistrict,
      targetCategory,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Post title is required." }, { status: 400 });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Post content / message is required." }, { status: 400 });
    }

    const isAdmin = ([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR] as Role[]).includes(user.role);

    // Case A: Platform Official Announcement (Admin / Partner Broadcast)
    if (isAdmin && !businessId) {
      const announcement = await prisma.$transaction(async (tx) => {
        const ann = await tx.partnerAnnouncement.create({
          data: {
            title: title.trim(),
            titleRw: titleRw?.trim() || null,
            message: content.trim(),
            messageRw: contentRw?.trim() || null,
            targetType: targetType || "ALL",
            targetDistrict: targetDistrict || null,
            targetCategory: targetCategory || null,
            status: "SENT",
            sentAt: new Date(),
            totalRecipients: 0,
            authorId: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "COMMUNITY_ANNOUNCEMENT_PUBLISHED",
            entityType: "ANNOUNCEMENT",
            entityId: ann.id,
            metadata: JSON.stringify({
              title: ann.title,
              targetType: ann.targetType,
              publishedBy: user.name,
            }),
          },
        });

        return ann;
      });

      // Immediate platform-wide revalidation
      try {
        revalidatePath("/");
        revalidatePath("/community");
        revalidatePath("/explore");
        revalidatePath("/admin");
      } catch {}

      return NextResponse.json({
        success: true,
        message: "Community announcement published successfully and visible immediately.",
        post: {
          id: announcement.id,
          sourceModel: "ANNOUNCEMENT",
          type: "OFFICIAL_ANNOUNCEMENT",
          title: announcement.title,
          content: announcement.message,
          authorName: user.name,
          authorRole: user.role,
          createdAt: announcement.createdAt.toISOString(),
        },
      }, { status: 201 });
    }

    // Case B: Business Enterprise Post / Update (Owner or Admin on behalf of business)
    let targetBizId = businessId;

    if (!targetBizId && user.role === Role.BUSINESS_OWNER) {
      const owned = await prisma.business.findFirst({
        where: { ownerId: user.id },
        select: { id: true },
      });
      if (owned) targetBizId = owned.id;
    }

    if (!targetBizId) {
      return NextResponse.json({ error: "businessId is required for enterprise posts." }, { status: 400 });
    }

    // Verify business ownership
    const business = await prisma.business.findUnique({
      where: { id: targetBizId },
      select: { id: true, name: true, ownerId: true, status: true },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    if (!isAdmin && business.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden: You do not own this business." }, { status: 403 });
    }

    // Map update type
    let updateType: BusinessUpdateType = BusinessUpdateType.ANNOUNCEMENT;
    if (type === "NEW_ARRIVAL") updateType = BusinessUpdateType.NEW_ARRIVAL;
    else if (type === "SERVICE_UPDATE") updateType = BusinessUpdateType.SERVICE_UPDATE;
    else if (type === "OFFER") updateType = BusinessUpdateType.OFFER;
    else if (type === "TEMPORARY_CLOSURE") updateType = BusinessUpdateType.TEMPORARY_CLOSURE;
    else if (type === "IMPORTANT_NOTICE" || type === "NOTICE") updateType = BusinessUpdateType.NOTICE;

    const createdUpdate = await prisma.$transaction(async (tx) => {
      const upd = await tx.businessUpdate.create({
        data: {
          businessId: business.id,
          type: updateType,
          title: title.trim(),
          titleRw: titleRw?.trim() || null,
          content: content.trim(),
          contentRw: contentRw?.trim() || null,
          badge: badge?.trim() || null,
          imageUrl: imageUrl?.trim() || null,
          validUntil: validUntil ? new Date(validUntil) : null,
          status: "ACTIVE",
          moderationStatus: "APPROVED",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "COMMUNITY_BUSINESS_UPDATE_PUBLISHED",
          entityType: "BUSINESS_UPDATE",
          entityId: upd.id,
          metadata: JSON.stringify({
            businessId: business.id,
            businessName: business.name,
            title: upd.title,
            type: upd.type,
          }),
        },
      });

      return upd;
    });

    // Immediate platform-wide revalidation
    try {
      revalidatePath("/");
      revalidatePath("/community");
      revalidatePath(`/business/${business.id}`);
      revalidatePath("/explore");
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Business post published successfully and visible in the community feed.",
      post: {
        id: createdUpdate.id,
        sourceModel: "BUSINESS_UPDATE",
        type: createdUpdate.type,
        title: createdUpdate.title,
        content: createdUpdate.content,
        badge: createdUpdate.badge,
        imageUrl: createdUpdate.imageUrl,
        businessName: business.name,
        businessId: business.id,
        createdAt: createdUpdate.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("[Community Posts POST Error]:", error);
    return NextResponse.json({
      error: "Failed to publish community post",
      details: error.message,
    }, { status: 500 });
  }
}

/**
 * DELETE /api/community/posts
 * Allows author or administrator to archive/remove a post.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth([
    Role.SUPER_ADMIN,
    Role.COMMUNITY_ADMIN,
    Role.MODERATOR,
    Role.BUSINESS_OWNER,
  ]);

  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("id");
  const model = searchParams.get("model") || "BUSINESS_UPDATE";

  if (!postId) {
    return NextResponse.json({ error: "Post ID is required." }, { status: 400 });
  }

  const isAdmin = ([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR] as Role[]).includes(auth.user.role);

  try {
    if (model === "ANNOUNCEMENT") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only administrators can delete official announcements." }, { status: 403 });
      }

      await prisma.partnerAnnouncement.update({
        where: { id: postId },
        data: { status: "ARCHIVED" },
      });

      await logAuditEvent({
        actorId: auth.user.id,
        action: "COMMUNITY_ANNOUNCEMENT_ARCHIVED",
        entityType: "ANNOUNCEMENT",
        entityId: postId,
      });
    } else {
      const update = await prisma.businessUpdate.findUnique({
        where: { id: postId },
        include: { business: { select: { ownerId: true } } },
      });

      if (!update) {
        return NextResponse.json({ error: "Post not found." }, { status: 404 });
      }

      if (!isAdmin && update.business.ownerId !== auth.user.id) {
        return NextResponse.json({ error: "Forbidden: You do not own this post." }, { status: 403 });
      }

      await prisma.businessUpdate.update({
        where: { id: postId },
        data: { status: "ARCHIVED" },
      });

      await logAuditEvent({
        actorId: auth.user.id,
        action: "COMMUNITY_BUSINESS_UPDATE_ARCHIVED",
        entityType: "BUSINESS_UPDATE",
        entityId: postId,
      });
    }

    try {
      revalidatePath("/");
      revalidatePath("/community");
      revalidatePath("/explore");
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Post archived successfully.",
    });
  } catch (error: any) {
    console.error("[Community Posts DELETE Error]:", error);
    return NextResponse.json({ error: "Failed to delete post", details: error.message }, { status: 500 });
  }
}
