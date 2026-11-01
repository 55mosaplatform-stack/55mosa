import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  checkPaymentRateLimit,
  getRateLimitClientIp,
  getRateLimitHeaders,
} from "@/lib/payments/rate-limiter";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "Missing businessId parameter" }, { status: 400 });
  }

  try {
    const reviews = await prisma.review.findMany({
      where: { businessId },
      include: {
        user: {
          select: { id: true, name: true, role: true, badges: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      count: reviews.length,
      source: "database",
      reviews: reviews.map((r) => ({
        id: r.id,
        businessId: r.businessId,
        userName: r.user?.name || "Verified Resident",
        userRole: r.user?.role || "CUSTOMER",
        rating: r.rating,
        comment: r.comment,
        commentRw: r.commentRw || r.comment,
        verifiedVisit: r.verifiedVisit,
        date: r.createdAt.toISOString().split("T")[0],
      })),
    });
  } catch (error) {
    console.error("[Reviews DB Error]:", error);
    return NextResponse.json({ error: "Failed to fetch reviews from database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getRateLimitClientIp(request);

    // Rate Limiting: Max 5 reviews per 60 minutes per IP
    const ipRateLimit = await checkPaymentRateLimit({
      key: `review:ip:${clientIp}`,
      limit: 5,
      windowSeconds: 3600,
    });

    if (!ipRateLimit.isAllowed) {
      return NextResponse.json(
        { error: "Too many reviews submitted from this location. Please try again later." },
        { status: 429, headers: getRateLimitHeaders(ipRateLimit) }
      );
    }

    const body = await request.json();
    const { 
      businessId, 
      userName = "Verified Resident", 
      rating = 5, 
      comment, 
      commentRw,
      userRole = "CUSTOMER" 
    } = body;

    const safeComment = typeof comment === "string" ? comment.trim().slice(0, 2000) : "";
    const safeCommentRw = typeof commentRw === "string" ? commentRw.trim().slice(0, 2000) : safeComment;
    const safeRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));

    if (!businessId || !safeComment) {
      return NextResponse.json({ error: "Missing businessId or review comment" }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    let userId = currentUser?.id;

    if (!userId) {
      const resident = await prisma.user.upsert({
        where: { phone: "+250788999888" },
        update: {},
        create: {
          phone: "+250788999888",
          name: typeof userName === "string" ? userName.trim().slice(0, 100) : "Verified Resident",
          role: "CUSTOMER",
          community: "Nyamirambo",
          points: 120,
          badges: ["Neighborhood Explorer"],
          referralCode: "MOSA-NYA-999",
        },
      });
      userId = resident.id;
    }

    const savedReview = await prisma.$transaction(async (tx) => {
      const rev = await tx.review.create({
        data: {
          businessId,
          userId,
          rating: safeRating,
          comment: safeComment,
          commentRw: safeCommentRw,
          verifiedVisit: true,
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: 10 } },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "REVIEW_SUBMITTED",
          entityType: "REVIEW",
          entityId: rev.id,
          metadata: JSON.stringify({ businessId, rating }),
        },
      });

      return rev;
    });

    return NextResponse.json({
      success: true,
      review: {
        id: savedReview.id,
        businessId: savedReview.businessId,
        userName: savedReview.user?.name || userName,
        rating: savedReview.rating,
        comment: savedReview.comment,
        date: savedReview.createdAt.toISOString().split("T")[0],
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[Review POST Error]:", error);
    return NextResponse.json({ error: "Failed to submit review in database" }, { status: 500 });
  }
}
