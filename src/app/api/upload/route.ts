import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { persistMediaAsset } from "@/lib/storage";
import { validateUploadSecurity } from "@/lib/security/guards-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAuth([
    Role.BUSINESS_OWNER,
    Role.SUPER_ADMIN,
    Role.COMMUNITY_ADMIN,
    Role.COMMUNITY_AGENT,
  ]);

  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    // Case 1: multipart/form-data upload
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "Missing required form file: 'file'" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const filename = file.name || "upload.bin";
      const mimeType = file.type || "application/octet-stream";

      const uploadCheck = validateUploadSecurity({
        filename,
        mimeType,
        sizeBytes: buffer.length,
      });

      if (!uploadCheck.isAllowed) {
        return NextResponse.json(
          { error: uploadCheck.rejectionReason || "File rejected by security guard." },
          { status: 400 }
        );
      }

      const result = await persistMediaAsset(buffer, filename, mimeType);
      return NextResponse.json({
        success: true,
        ...result,
        uploadedBy: auth.user.id,
        timestamp: new Date().toISOString(),
      });
    }

    // Case 2: JSON payload with base64 data
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { base64, dataUrl, filename = "upload.bin", mimeType: customMime } = body;

      let buffer: Buffer;
      let resolvedMime = customMime || "image/jpeg";

      if (dataUrl && typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
        const matches = dataUrl.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return NextResponse.json({ error: "Invalid data URL format" }, { status: 400 });
        }
        resolvedMime = matches[1];
        buffer = Buffer.from(matches[2], "base64");
      } else if (base64 && typeof base64 === "string") {
        buffer = Buffer.from(base64, "base64");
      } else {
        return NextResponse.json(
          { error: "Invalid JSON upload. Provide 'file' via formData or 'dataUrl' / 'base64' via JSON." },
          { status: 400 }
        );
      }

      const uploadCheck = validateUploadSecurity({
        filename,
        mimeType: resolvedMime,
        sizeBytes: buffer.length,
      });

      if (!uploadCheck.isAllowed) {
        return NextResponse.json(
          { error: uploadCheck.rejectionReason || "File rejected by security guard." },
          { status: 400 }
        );
      }

      const result = await persistMediaAsset(buffer, filename, resolvedMime);
      return NextResponse.json({
        success: true,
        ...result,
        uploadedBy: auth.user.id,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: "Unsupported Content-Type. Use multipart/form-data or application/json." },
      { status: 415 }
    );
  } catch (error: any) {
    console.error("[Upload API Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to process media upload" }, { status: 400 });
  }
}
