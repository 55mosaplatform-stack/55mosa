import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { Role, MosaDirectCategory, MosaDirectStatus, MosaDirectPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/direct
 * Secure endpoint for authorized platform administrators to view, search, and filter
 * all MOSA DIRECT submissions, unread counts, metrics, and assignable staff.
 */
export async function GET(request: Request) {
  const auth = await requireAuth([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR]);
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category");
    const statusParam = searchParams.get("status");
    const priorityParam = searchParams.get("priority");
    const countryParam = searchParams.get("country");
    const isReadParam = searchParams.get("isRead");
    const search = searchParams.get("search")?.trim() || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const skip = (page - 1) * limit;

    // Build Prisma where clause
    const where: any = {};

    if (categoryParam && categoryParam !== "ALL") {
      where.category = categoryParam as MosaDirectCategory;
    }
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam as MosaDirectStatus;
    }
    if (priorityParam && priorityParam !== "ALL") {
      where.priority = priorityParam as MosaDirectPriority;
    }
    if (countryParam && countryParam !== "ALL") {
      where.senderCountry = { equals: countryParam, mode: "insensitive" };
    }
    if (isReadParam && isReadParam !== "ALL") {
      where.isRead = isReadParam === "true";
    }

    if (search) {
      where.OR = [
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
        { senderName: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
        { senderPhone: { contains: search, mode: "insensitive" } },
        { relatedBusinessName: { contains: search, mode: "insensitive" } },
      ];
    }

    // Parallel fetch: submissions, total counts, metrics, and assignable staff
    const [
      submissions,
      totalCount,
      newUnreadCount,
      urgentCount,
      inProgressCount,
      resolvedCount,
      allCategoriesAgg,
      allStatusesAgg,
      assignableStaff,
    ] = await Promise.all([
      prisma.mosaDirectMessage.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      }),
      prisma.mosaDirectMessage.count({ where }),
      prisma.mosaDirectMessage.count({
        where: {
          OR: [{ isRead: false }, { status: MosaDirectStatus.NEW }],
        },
      }),
      prisma.mosaDirectMessage.count({
        where: { priority: MosaDirectPriority.URGENT },
      }),
      prisma.mosaDirectMessage.count({
        where: {
          status: { in: [MosaDirectStatus.UNDER_REVIEW, MosaDirectStatus.IN_PROGRESS] },
        },
      }),
      prisma.mosaDirectMessage.count({
        where: {
          status: { in: [MosaDirectStatus.RESOLVED, MosaDirectStatus.CLOSED] },
        },
      }),
      prisma.mosaDirectMessage.groupBy({
        by: ["category"],
        _count: { id: true },
      }),
      prisma.mosaDirectMessage.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.user.findMany({
        where: {
          role: { in: [Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          phone: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const categoryBreakdown: Record<string, number> = {};
    for (const item of allCategoriesAgg) {
      categoryBreakdown[item.category] = item._count.id;
    }

    const statusBreakdown: Record<string, number> = {};
    for (const item of allStatusesAgg) {
      statusBreakdown[item.status] = item._count.id;
    }

    return NextResponse.json({
      success: true,
      submissions,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      metrics: {
        totalSubmissions: totalCount,
        newUnreadCount,
        urgentCount,
        inProgressCount,
        resolvedCount,
        categoryBreakdown,
        statusBreakdown,
      },
      assignableStaff,
    });
  } catch (error: any) {
    console.error("[Admin MOSA DIRECT GET Error]:", error);
    return NextResponse.json(
      { error: "Failed to retrieve MOSA DIRECT submissions." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/direct
 * Allows authorized administrators to triage, assign, update status/priority,
 * add internal admin notes, or record private responses to senders.
 */
export async function PATCH(request: Request) {
  const auth = await requireAuth([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR]);
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json();
    const { id, status, priority, isRead, assignedToId, adminNotes, newResponse } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing required submission ID." }, { status: 400 });
    }

    const existing = await prisma.mosaDirectMessage.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "MOSA DIRECT submission not found." }, { status: 404 });
    }

    const updateData: any = {};

    if (status && Object.values(MosaDirectStatus).includes(status)) {
      updateData.status = status;
    }

    if (priority && Object.values(MosaDirectPriority).includes(priority)) {
      updateData.priority = priority;
    }

    if (typeof isRead === "boolean") {
      updateData.isRead = isRead;
      if (isRead && !existing.readAt) {
        updateData.readAt = new Date();
        updateData.readById = auth.user.id;
      }
    }

    if (assignedToId !== undefined) {
      updateData.assignedToId = assignedToId ? String(assignedToId).trim() : null;
    }

    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes ? String(adminNotes).trim() : null;
    }

    // Append new private response to history if supplied
    if (newResponse && typeof newResponse === "object" && newResponse.text) {
      const currentHistory = Array.isArray(existing.responseHistory)
        ? (existing.responseHistory as any[])
        : [];

      const newEntry = {
        id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: String(newResponse.text).trim(),
        channel: newResponse.channel || "INTERNAL_NOTE",
        respondedAt: new Date().toISOString(),
        respondedByName: auth.user.name,
        respondedById: auth.user.id,
      };

      updateData.responseHistory = [...currentHistory, newEntry];

      // If responding, update status to IN_PROGRESS or RESOLVED if currently NEW
      if (existing.status === MosaDirectStatus.NEW) {
        updateData.status = MosaDirectStatus.UNDER_REVIEW;
      }
      updateData.isRead = true;
    }

    const updated = await prisma.mosaDirectMessage.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    // Immutable audit log
    await logAuditEvent({
      actorId: auth.user.id,
      action: "MOSA_DIRECT_UPDATED",
      entityType: "MOSA_DIRECT",
      entityId: id,
      metadata: {
        referenceNumber: existing.referenceNumber,
        category: existing.category,
        previousStatus: existing.status,
        newStatus: updateData.status || existing.status,
        previousPriority: existing.priority,
        newPriority: updateData.priority || existing.priority,
        assignedToId: updateData.assignedToId,
        hasNewResponse: Boolean(newResponse?.text),
      },
    });

    return NextResponse.json({
      success: true,
      submission: updated,
      message: "MOSA DIRECT submission successfully updated.",
    });
  } catch (error: any) {
    console.error("[Admin MOSA DIRECT PATCH Error]:", error);
    return NextResponse.json(
      { error: "Failed to update MOSA DIRECT submission." },
      { status: 500 }
    );
  }
}
