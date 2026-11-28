import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "COMMUNITY_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const customCategories = await prisma.customCategory.findMany({
      include: {
        createdBy: {
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: { businesses: true },
        },
      },
      orderBy: [
        { usageCount: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({
      success: true,
      customCategories,
    });
  } catch (error: any) {
    console.error("[Admin Categories GET Error]:", error);
    return NextResponse.json({ error: "Failed to fetch custom categories" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "COMMUNITY_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, adminNotes } = body;

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const updated = await prisma.customCategory.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(adminNotes !== undefined && { adminNotes }),
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    await logAuditEvent({
      actorId: user.id,
      action: "CUSTOM_CATEGORY_REVIEWED",
      entityType: "CATEGORY",
      entityId: id,
      metadata: { status, adminNotes },
    });

    return NextResponse.json({
      success: true,
      category: updated,
    });
  } catch (error: any) {
    console.error("[Admin Categories PATCH Error]:", error);
    return NextResponse.json({ error: "Failed to update custom category" }, { status: 500 });
  }
}
