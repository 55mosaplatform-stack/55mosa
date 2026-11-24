import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Role, DataStatus, VerificationStatus } from "@prisma/client";
import { calculateAndPersistBusinessHealth } from "@/lib/business-health";

/**
 * GET /api/admin/businesses/[id]/content
 * On-demand drill-down endpoint: returns complete, unfiltered business content
 * (all media, videos, photos, products, services, reviews, reports, and change history)
 * for administrative investigation and moderation without cluttering the main dashboard.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR]);
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  try {
    const { id } = await params;

    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, phone: true, email: true } },
        media: { orderBy: [{ isCover: "desc" }, { createdAt: "desc" }] },
        products: { orderBy: { createdAt: "desc" } },
        reviews: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, phone: true } } } },
        reports: { orderBy: { createdAt: "desc" } },
        updates: { orderBy: { createdAt: "desc" } },
        opportunities: { orderBy: { createdAt: "desc" }, include: { inquiries: { take: 10 } } },
        changeHistory: { take: 25, orderBy: { createdAt: "desc" } },
        verifications: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const photos = business.media.filter((m) => m.mediaType === "IMAGE");
    const videos = business.media.filter((m) => m.mediaType === "VIDEO");

    return NextResponse.json({
      success: true,
      business,
      photos,
      videos,
      products: business.products,
      reports: business.reports,
      changeHistory: business.changeHistory,
      stats: {
        totalPhotos: photos.length,
        totalVideos: videos.length,
        totalProducts: business.products.filter((p) => !p.isService).length,
        totalServices: business.products.filter((p) => p.isService).length,
        totalUpdates: business.updates.length,
        totalOpportunities: business.opportunities.length,
        totalReports: business.reports.length,
        openReports: business.reports.filter((r) => r.status === "OPEN").length,
      },
    });
  } catch (error) {
    console.error("[Admin Business Content GET Error]:", error);
    return NextResponse.json({ error: "Failed to load business content" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/businesses/[id]/content
 * Command Center Administrative Content & Profile Management.
 * Allows authorized administrators (SUPER_ADMIN, COMMUNITY_ADMIN, MODERATOR) to:
 * 1. Update business details (name, description, phone, address, landmark, category, status, verificationStatus)
 * 2. Moderate or update individual products/services (name, price, availability, moderationStatus, archive)
 * 3. Moderate or update individual media items (caption, isCover, moderationStatus)
 * Full audit logging (AuditLog & BusinessChangeHistory) and public cache revalidation are guaranteed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth([Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR]);
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const adminId = auth.user.id;

    const existingBiz = await prisma.business.findUnique({
      where: { id },
      select: { id: true, name: true, ownerId: true, status: true, verificationStatus: true, dataStatus: true },
    });

    if (!existingBiz) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Branch 1: Product Moderation / Update
    if (body.productUpdate) {
      const { id: productId, name, price, isAvailable, moderationStatus, isArchived } = body.productUpdate;
      if (!productId) {
        return NextResponse.json({ error: "productUpdate.id is required" }, { status: 400 });
      }

      const prod = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!prod || prod.businessId !== id) {
        return NextResponse.json({ error: "Product not found for this business" }, { status: 404 });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (price !== undefined) updateData.price = Number(price);
      if (isAvailable !== undefined) updateData.isAvailable = Boolean(isAvailable);
      if (moderationStatus !== undefined) updateData.moderationStatus = moderationStatus;
      if (isArchived !== undefined) updateData.isArchived = Boolean(isArchived);

      const updatedProduct = await prisma.$transaction(async (tx) => {
        const p = await tx.product.update({
          where: { id: productId },
          data: updateData,
        });

        await tx.businessChangeHistory.create({
          data: {
            businessId: id,
            productId,
            actorId: adminId,
            action: "ADMIN_PRODUCT_EDITED",
            fieldChanged: Object.keys(updateData).join(", "),
            previousValue: JSON.stringify({ name: prod.name, price: prod.price, isAvailable: prod.isAvailable }),
            newValue: JSON.stringify(updateData),
            approvalStatus: "APPROVED",
            source: "COMMAND_CENTER",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: "ADMIN_PRODUCT_MODERATED",
            entityType: "PRODUCT",
            entityId: productId,
            metadata: JSON.stringify({ businessId: id, updates: updateData }),
          },
        });

        return p;
      });

      revalidatePath(`/business/${id}`);
      revalidatePath("/admin");
      revalidatePath("/explore");

      return NextResponse.json({ success: true, product: updatedProduct });
    }

    // Branch 2: Media Moderation / Update
    if (body.mediaUpdate) {
      const { id: mediaId, caption, isCover, moderationStatus } = body.mediaUpdate;
      if (!mediaId) {
        return NextResponse.json({ error: "mediaUpdate.id is required" }, { status: 400 });
      }

      const media = await prisma.businessMedia.findUnique({
        where: { id: mediaId },
      });

      if (!media || media.businessId !== id) {
        return NextResponse.json({ error: "Media item not found for this business" }, { status: 404 });
      }

      const updatedMedia = await prisma.$transaction(async (tx) => {
        const updateData: any = {};
        if (caption !== undefined) updateData.caption = caption?.trim() || null;
        if (moderationStatus !== undefined) updateData.moderationStatus = moderationStatus;
        if (isCover !== undefined) {
          updateData.isCover = Boolean(isCover);
          if (Boolean(isCover)) {
            await tx.businessMedia.updateMany({
              where: { businessId: id, isCover: true, id: { not: mediaId } },
              data: { isCover: false },
            });
            await tx.business.update({
              where: { id },
              data: { coverImage: media.url },
            });
          }
        }

        const m = await tx.businessMedia.update({
          where: { id: mediaId },
          data: updateData,
        });

        await tx.businessChangeHistory.create({
          data: {
            businessId: id,
            actorId: adminId,
            action: "ADMIN_MEDIA_MODERATED",
            fieldChanged: Object.keys(updateData).join(", "),
            newValue: JSON.stringify(updateData),
            approvalStatus: "APPROVED",
            source: "COMMAND_CENTER",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: "ADMIN_MEDIA_MODERATED",
            entityType: "BUSINESS_MEDIA",
            entityId: mediaId,
            metadata: JSON.stringify({ businessId: id, updates: updateData }),
          },
        });

        return m;
      });

      revalidatePath(`/business/${id}`);
      revalidatePath("/admin");
      revalidatePath("/explore");

      return NextResponse.json({ success: true, media: updatedMedia });
    }

    // Branch 3: Direct Business Profile / Operational Updates
    const allowedFields = [
      "name",
      "nameRw",
      "description",
      "descriptionRw",
      "phone",
      "whatsapp",
      "email",
      "address",
      "landmark",
      "category",
      "subCategory",
      "businessType",
      "status",
      "dataStatus",
      "verificationStatus",
      "coverImage",
      "logoImage",
    ];

    const dataToUpdate: any = {};
    const changes: Record<string, { from: any; to: any }> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        dataToUpdate[field] = body[field];
        changes[field] = { from: (existingBiz as any)[field], to: body[field] };
      }
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: "No valid fields provided for update" }, { status: 400 });
    }

    const updatedBiz = await prisma.$transaction(async (tx) => {
      const biz = await tx.business.update({
        where: { id },
        data: dataToUpdate,
      });

      await tx.businessChangeHistory.create({
        data: {
          businessId: id,
          actorId: adminId,
          action: "ADMIN_BUSINESS_EDITED",
          fieldChanged: Object.keys(changes).join(", "),
          newValue: JSON.stringify(changes),
          approvalStatus: "APPROVED",
          source: "COMMAND_CENTER",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: "ADMIN_BUSINESS_UPDATED",
          entityType: "BUSINESS",
          entityId: id,
          metadata: JSON.stringify({ changes }),
        },
      });

      return biz;
    });

    revalidatePath(`/business/${id}`);
    revalidatePath("/admin");
    revalidatePath("/explore");
    revalidatePath("/search");
    revalidatePath("/");

    calculateAndPersistBusinessHealth(id).catch(() => {});

    return NextResponse.json({
      success: true,
      business: updatedBiz,
      message: "Business details successfully updated by Command Center administrator.",
    });
  } catch (error) {
    console.error("[Admin Business Content PATCH Error]:", error);
    return NextResponse.json({ error: "Failed to update business content" }, { status: 500 });
  }
}
