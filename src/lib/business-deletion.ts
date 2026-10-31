import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

export interface DeleteBusinessResult {
  success: boolean;
  deletedId?: string;
  businessName?: string;
  error?: string;
  status: number;
}

export interface AdminActor {
  id: string;
  name: string;
  email?: string | null;
  role: Role;
}

/**
 * Permanently deletes a business and all associated public discoverable content,
 * while strictly preserving financial records, receipts, and immutable audit history.
 */
export async function permanentlyDeleteBusiness(
  businessId: string,
  adminUser: AdminActor
): Promise<DeleteBusinessResult> {
  // 1. Authorization clearance check
  if (adminUser.role !== Role.SUPER_ADMIN && adminUser.role !== Role.COMMUNITY_ADMIN) {
    return {
      success: false,
      error: "Forbidden: Permanent business deletion requires SUPER_ADMIN or COMMUNITY_ADMIN clearance",
      status: 403,
    };
  }

  if (!businessId || typeof businessId !== "string") {
    return {
      success: false,
      error: "Invalid business ID provided",
      status: 400,
    };
  }

  // 2. Fetch the target business with related financial records
  const targetBiz = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      products: { select: { id: true, name: true } },
      media: { select: { id: true, url: true } },
      registrationPayments: {
        select: {
          id: true,
          paymentReference: true,
          provider: true,
          feeAmount: true,
          currency: true,
          status: true,
          payerUserId: true,
          providerTransactionRef: true,
        },
      },
      registrationReceipts: {
        select: {
          id: true,
          receiptNumber: true,
          amountPaid: true,
          currency: true,
          paymentMethod: true,
        },
      },
    },
  });

  if (!targetBiz) {
    return {
      success: false,
      error: "Business not found or already deleted",
      status: 404,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 3. Decouple ReceiptCapture references so receipt files and proof remain intact
      await tx.receiptCapture.updateMany({
        where: { businessId },
        data: { businessId: null },
      });

      // 4. Preserve financial & payment accountability in immutable audit log before cascade
      if (targetBiz.registrationPayments.length > 0 || targetBiz.registrationReceipts.length > 0) {
        await tx.auditLog.create({
          data: {
            actorId: adminUser.id,
            action: "ADMIN_BUSINESS_PAYMENTS_ARCHIVED",
            entityType: "BUSINESS",
            entityId: businessId,
            metadata: JSON.stringify({
              businessName: targetBiz.name,
              businessPhone: targetBiz.phone,
              paymentsCount: targetBiz.registrationPayments.length,
              receiptsCount: targetBiz.registrationReceipts.length,
              payments: targetBiz.registrationPayments,
              receipts: targetBiz.registrationReceipts,
              archivedAt: new Date().toISOString(),
              reason: "Financial integrity snapshot preserved prior to permanent business deletion",
            }),
          },
        });
      }

      // 5. Record permanent deletion event in immutable audit log
      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          action: "ADMIN_BUSINESS_PERMANENTLY_DELETED",
          entityType: "BUSINESS",
          entityId: businessId,
          metadata: JSON.stringify({
            deletedBy: adminUser.name,
            adminEmail: adminUser.email,
            adminRole: adminUser.role,
            businessName: targetBiz.name,
            phone: targetBiz.phone,
            category: targetBiz.category,
            sector: targetBiz.sector,
            cell: targetBiz.cell,
            productsCount: targetBiz.products.length,
            mediaCount: targetBiz.media.length,
            paymentsCount: targetBiz.registrationPayments.length,
            deletedAt: new Date().toISOString(),
            reason: "Permanent administrative deletion confirmed by Command Center",
          }),
        },
      });

      // 6. Permanently delete the business record from PostgreSQL
      // Relational foreign-key cascades automatically remove products, media, hours, reviews, updates, etc.
      await tx.business.delete({
        where: { id: businessId },
      });
    });

    // 7. Invalidate caches and search indexes
    try {
      revalidatePath("/admin");
      revalidatePath("/explore");
      revalidatePath("/search");
      revalidatePath("/");
      revalidatePath(`/business/${businessId}`);
    } catch {
      // Outside Next.js request context (e.g. test environment)
    }

    return {
      success: true,
      deletedId: businessId,
      businessName: targetBiz.name,
      status: 200,
    };
  } catch (error: any) {
    console.error(`[Permanent Business Deletion Error on ${businessId}]:`, error);
    return {
      success: false,
      error: `Failed to permanently delete business: ${error?.message || "Internal database error"}`,
      status: 500,
    };
  }
}
