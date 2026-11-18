import { prisma } from "../src/lib/prisma";

const BASE_URL = "https://mosa-one.vercel.app";

async function run() {
  console.log("================================================================================");
  console.log("MOSA COMPLETE PRODUCTION DATABASE & REAL-TIME ACCEPTANCE TEST SUITE");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Database: Supabase PostgreSQL (ghzmdjpymftjotlviiot)`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  const results: Record<string, { status: "PASS" | "FAIL"; details: string; evidence?: any }> = {};

  try {
    // -------------------------------------------------------------------------
    // STEP 0: Admin Authentication
    // -------------------------------------------------------------------------
    console.log(">>> [STEP 0] Authenticating Super Administrator (55mosaplatform@gmail.com)...");
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "55mosaplatform@gmail.com",
        password: "EddyPro256",
      }),
    });

    const loginData = await loginRes.json();
    const rawCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    const sessionStr = rawCookies.find(c => c.startsWith("mosa_session=")) || "";
    const tokenMatch = sessionStr.match(/mosa_session=([^;]+)/);
    const adminToken = tokenMatch ? tokenMatch[1] : "";
    const adminCookie = `mosa_session=${adminToken}`;

    if (loginRes.status === 200 && loginData.success) {
      console.log("✓ Super Administrator authenticated successfully.");
    } else {
      throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST A: Real-Time Business Registration
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST A] Testing Real-Time Enterprise Self-Registration...");
    const testPhone = "+250789999001";
    const testBizName = "Kigali Horizon Tech Hub & Studio";

    // Clean up any prior test run with this phone if present
    const existingTestBiz = await prisma.business.findFirst({
      where: { phone: testPhone },
    });
    if (existingTestBiz) {
      await prisma.business.delete({ where: { id: existingTestBiz.id } });
    }

    const regPayload = {
      name: testBizName,
      nameRw: "Ihuriro ry'Ikoranabuhanga Kigali Horizon",
      ownerName: "Eddy Test Proprietor",
      category: "repair_maintenance",
      categoryDisplay: "Electronics & Tech Repair",
      categoryDisplayRw: "Gusana Ibyuma by'Ikoranabuhanga",
      description: "Professional laptop and mobile electronics hardware diagnostic and repair center.",
      phone: testPhone,
      password: "TestPassword123!",
      district: "Nyarugenge",
      sector: "Nyamirambo",
      cell: "Biryogo",
      nearestLandmark: "Biryogo Car-Free Zone near Mosque",
      latitude: -1.9815,
      longitude: 30.0462,
      locationAccuracy: 12.5,
      products: [
        {
          name: "Laptop Screen Replacement",
          price: 45000,
          currency: "RWF",
          isService: true,
        },
      ],
    };

    const regRes = await fetch(`${BASE_URL}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regPayload),
    });

    const regData = await regRes.json();
    console.log("Registration Response:", regRes.status, regData.message || regData.error);

    if (regRes.status !== 201 || !regData.businessId) {
      throw new Error(`Business registration failed: ${JSON.stringify(regData)}`);
    }

    const testBizId = regData.businessId;

    // Direct Database Verification: verify record in Supabase PostgreSQL
    const dbRecord = await prisma.business.findUnique({
      where: { id: testBizId },
      include: { owner: true, products: true },
    });

    if (!dbRecord) {
      throw new Error("Registered business not found in Supabase database!");
    }

    const isPending = dbRecord.status === "PENDING";
    const isUnverified = dbRecord.verificationStatus === "UNVERIFIED";
    const isResearched = dbRecord.dataStatus === "RESEARCHED";

    // Public Directory Verification: must NOT appear in public directory prematurely
    const pubDirRes = await fetch(`${BASE_URL}/api/businesses?dataStatus=VERIFIED`);
    const pubDirData = await pubDirRes.json();
    const prematurelyInDirectory = pubDirData.businesses?.some((b: any) => b.id === testBizId);

    if (isPending && isUnverified && !prematurelyInDirectory) {
      results["TEST_A_BUSINESS_REGISTRATION"] = {
        status: "PASS",
        details: "Business registered into Supabase PostgreSQL with PENDING status, UNVERIFIED status, and correctly excluded from public verified directory.",
        evidence: {
          businessId: dbRecord.id,
          name: dbRecord.name,
          phone: dbRecord.phone,
          status: dbRecord.status,
          verificationStatus: dbRecord.verificationStatus,
          dataStatus: dbRecord.dataStatus,
          ownerName: dbRecord.owner?.name,
          productsCount: dbRecord.products.length,
          prematurelyInDirectory,
        },
      };
      console.log("✓ TEST A PASSED: Registered business exists in DB as PENDING, UNVERIFIED, not in public directory.");
    } else {
      results["TEST_A_BUSINESS_REGISTRATION"] = {
        status: "FAIL",
        details: `Status check failed. isPending=${isPending}, isUnverified=${isUnverified}, prematurelyInDirectory=${prematurelyInDirectory}`,
      };
    }

    // -------------------------------------------------------------------------
    // TEST B: Real-Time Business Approval in Command Center
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST B] Testing Command Center Business Approval...");
    const approveRes = await fetch(`${BASE_URL}/api/admin`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        action: "APPROVE_BUSINESS",
        businessId: testBizId,
        notes: "Verified by Super Administrator during live production acceptance testing.",
      }),
    });

    const approveData = await approveRes.json();
    console.log("Approve Response:", approveRes.status, approveData);

    // Verify DB update
    const approvedDbRecord = await prisma.business.findUnique({
      where: { id: testBizId },
    });

    const auditRecord = await prisma.auditLog.findFirst({
      where: { entityId: testBizId, action: "BUSINESS_APPROVED" },
      orderBy: { createdAt: "desc" },
    });

    // Public Directory Verification: MUST now appear in public directory
    const afterApproveDirRes = await fetch(`${BASE_URL}/api/businesses?dataStatus=VERIFIED`);
    const afterApproveDirData = await afterApproveDirRes.json();
    const nowInDirectory = afterApproveDirData.businesses?.some((b: any) => b.id === testBizId);

    // Business Detail Page Verification
    const detailRes = await fetch(`${BASE_URL}/api/businesses/${testBizId}`);
    const detailData = await detailRes.json();

    if (
      approvedDbRecord?.status === "ACTIVE" &&
      approvedDbRecord?.verificationStatus === "HIGH_CONFIDENCE" &&
      approvedDbRecord?.dataStatus === "VERIFIED" &&
      nowInDirectory &&
      detailRes.status === 200 &&
      auditRecord
    ) {
      results["TEST_B_BUSINESS_APPROVAL"] = {
        status: "PASS",
        details: "Business approved via Command Center. Updated in Supabase to ACTIVE / HIGH_CONFIDENCE / VERIFIED. Audit log created. Immediately visible in public directory and detail API.",
        evidence: {
          businessId: testBizId,
          status: approvedDbRecord.status,
          verificationStatus: approvedDbRecord.verificationStatus,
          dataStatus: approvedDbRecord.dataStatus,
          nowInPublicDirectory: nowInDirectory,
          detailApiStatus: detailRes.status,
          auditLogAction: auditRecord.action,
        },
      };
      console.log("✓ TEST B PASSED: Business approved, verified in Supabase, and immediately visible in public directory.");
    } else {
      results["TEST_B_BUSINESS_APPROVAL"] = {
        status: "FAIL",
        details: `Approval check failed. status=${approvedDbRecord?.status}, nowInDirectory=${nowInDirectory}, detailStatus=${detailRes.status}`,
      };
    }

    // -------------------------------------------------------------------------
    // TEST C: Business Profile Update & Synchronization
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST C] Testing Business Profile Update...");
    const updatedDescription = "Updated: Premier laptop, smartphone, and tablet hardware repair laboratory with guaranteed warranty.";
    const updatedPhone = "+250789999002";

    const editRes = await fetch(`${BASE_URL}/api/admin`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        action: "EDIT_BUSINESS",
        businessId: testBizId,
        description: updatedDescription,
        phone: updatedPhone,
      }),
    });

    const editData = await editRes.json();
    console.log("Edit Response:", editRes.status, editData.success);

    // Query DB
    const updatedDb = await prisma.business.findUnique({
      where: { id: testBizId },
    });

    // Query Detail API
    const updatedDetailRes = await fetch(`${BASE_URL}/api/businesses/${testBizId}`);
    const updatedDetailData = await updatedDetailRes.json();

    if (
      updatedDb?.description === updatedDescription &&
      updatedDb?.phone === updatedPhone &&
      updatedDetailData.business?.phone === updatedPhone
    ) {
      results["TEST_C_BUSINESS_UPDATE"] = {
        status: "PASS",
        details: "Business profile updated and persisted in Supabase PostgreSQL. Verified via live public business detail API.",
        evidence: {
          businessId: testBizId,
          updatedPhone: updatedDb.phone,
          updatedDescription: updatedDb.description,
        },
      };
      console.log("✓ TEST C PASSED: Business updates persisted and reflected on public API.");
    } else {
      results["TEST_C_BUSINESS_UPDATE"] = {
        status: "FAIL",
        details: "Business update verification failed.",
      };
    }

    // -------------------------------------------------------------------------
    // TEST D: Community Post / Announcement Creation & Synchronization
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST D] Testing Real-Time Community Post Creation...");
    const testPostTitle = "Official Community Notice: Pilot Commerce Verification Drive";
    const testPostContent = "MOSA Governance Team is conducting on-site digital verification for registered merchants in Nyamirambo Biryogo and Mumena.";

    const postCreateRes = await fetch(`${BASE_URL}/api/community/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        title: testPostTitle,
        titleRw: "Itangazo ry'Ubuyobozi: Gahunda yo Kwemeza Ubucuruzi mu Karere",
        content: testPostContent,
        contentRw: "Itsinda rya MOSA ririmo gusura abacuruzi b'i Nyamirambo muri gahunda yo kubemeza ku rubuga.",
        type: "ANNOUNCEMENT",
        badge: "OFFICIAL DIRECTIVE",
        targetType: "ALL",
      }),
    });

    const postCreateData = await postCreateRes.json();
    console.log("Post Create Response:", postCreateRes.status, postCreateData.message || postCreateData.error);

    if (postCreateRes.status !== 201 || !postCreateData.post?.id) {
      throw new Error(`Community post creation failed: ${JSON.stringify(postCreateData)}`);
    }

    const createdPostId = postCreateData.post.id;

    // Verify in database
    const announcementInDb = await prisma.partnerAnnouncement.findUnique({
      where: { id: createdPostId },
      include: { author: true },
    });

    // Verify in public feed API
    const feedRes = await fetch(`${BASE_URL}/api/community/posts`);
    const feedData = await feedRes.json();
    const postInFeed = feedData.posts?.find((p: any) => p.id === createdPostId);

    if (announcementInDb && postInFeed) {
      results["TEST_D_COMMUNITY_POST"] = {
        status: "PASS",
        details: "Community announcement stored in Supabase partnerAnnouncement table and immediately returned by public /api/community/posts feed.",
        evidence: {
          postId: createdPostId,
          title: announcementInDb.title,
          status: announcementInDb.status,
          authorName: announcementInDb.author?.name,
          feedContainsPost: true,
          feedTotalCount: feedData.count,
        },
      };
      console.log("✓ TEST D PASSED: Community post stored in Supabase and visible in public feed.");
    } else {
      results["TEST_D_COMMUNITY_POST"] = {
        status: "FAIL",
        details: `Post verification failed. dbRecord=${Boolean(announcementInDb)}, inFeed=${Boolean(postInFeed)}`,
      };
    }

    // -------------------------------------------------------------------------
    // TEST E: Command Center Platform Settings Persistence
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST E] Testing Command Center Platform Settings Update...");
    const updatedTagline = "Global Verified Neighborhood Commerce Network";
    const updatedAddress = "Kigali, Rwanda • Nyarugenge District • Nyamirambo Pilot Hub";

    const settingsUpdateRes = await fetch(`${BASE_URL}/api/admin/platform-settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        tagline: updatedTagline,
        officialAddress: updatedAddress,
      }),
    });

    const settingsUpdateData = await settingsUpdateRes.json();
    console.log("Settings Update Response:", settingsUpdateRes.status, settingsUpdateData.message || settingsUpdateData.error);

    // Verify in database
    const dbSettings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });

    // Verify in public API
    const pubSettingsRes = await fetch(`${BASE_URL}/api/platform/settings`, { cache: "no-store" });
    const pubSettingsData = await pubSettingsRes.json();

    if (
      dbSettings?.tagline === updatedTagline &&
      dbSettings?.officialAddress === updatedAddress &&
      pubSettingsData.tagline === updatedTagline
    ) {
      results["TEST_E_COMMAND_CENTER_SETTINGS"] = {
        status: "PASS",
        details: "Platform settings updated via Command Center, persisted in platformSettings table, and immediately reflected on public /api/platform/settings.",
        evidence: {
          tagline: dbSettings.tagline,
          officialAddress: dbSettings.officialAddress,
          updatedBy: dbSettings.updatedBy,
          publicApiVerified: true,
        },
      };
      console.log("✓ TEST E PASSED: Platform settings persisted and synchronized with public API.");
    } else {
      results["TEST_E_COMMAND_CENTER_SETTINGS"] = {
        status: "FAIL",
        details: "Platform settings verification failed.",
      };
    }

    // -------------------------------------------------------------------------
    // TEST F: Media & Logo Reference Persistence
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST F] Testing Media / Image Reference Persistence...");
    const testLogoUrl = "https://mosa-one.vercel.app/mosa-logo.png";
    const mediaUpdate = await prisma.business.update({
      where: { id: testBizId },
      data: {
        logo: testLogoUrl,
        coverImage: testLogoUrl,
      },
    });

    const mediaDetailRes = await fetch(`${BASE_URL}/api/businesses/${testBizId}`);
    const mediaDetailData = await mediaDetailRes.json();

    if (
      mediaUpdate.logo === testLogoUrl &&
      mediaDetailData.business?.logo === testLogoUrl
    ) {
      results["TEST_F_MEDIA_PERSISTENCE"] = {
        status: "PASS",
        details: "Media and branding references persisted in PostgreSQL business record and verified on public business API.",
        evidence: {
          businessId: testBizId,
          logo: mediaUpdate.logo,
          coverImage: mediaUpdate.coverImage,
          detailApiLogo: mediaDetailData.business?.logo,
        },
      };
      console.log("✓ TEST F PASSED: Media reference persisted in Supabase and retrieved via public API.");
    } else {
      results["TEST_F_MEDIA_PERSISTENCE"] = {
        status: "FAIL",
        details: "Media reference verification failed.",
      };
    }

    // -------------------------------------------------------------------------
    // TEST G: Multi-Session / Multi-User Synchronization
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST G] Testing Multi-Session Real-Time Synchronization...");
    const syncDesc = "Real-Time Synchronized multi-user description update.";
    await prisma.business.update({
      where: { id: testBizId },
      data: { description: syncDesc },
    });

    // Re-query from consumer session
    const consumerRes2 = await fetch(`${BASE_URL}/api/businesses/${testBizId}`, { cache: "no-store" });
    const consumerData2 = await consumerRes2.json();

    if (consumerData2.business?.description === syncDesc) {
      results["TEST_G_MULTI_USER_SYNC"] = {
        status: "PASS",
        details: "Updates made to database records are immediately reflected in independent client requests without server redeployment.",
        evidence: {
          syncedDescription: consumerData2.business?.description,
        },
      };
      console.log("✓ TEST G PASSED: Multi-session real-time synchronization verified.");
    } else {
      results["TEST_G_MULTI_USER_SYNC"] = {
        status: "FAIL",
        details: `Multi-session synchronization check failed. Got: ${consumerData2.business?.description}`,
      };
    }

    // -------------------------------------------------------------------------
    // TEST H: Permanent Record Keeping & Data Persistence
    // -------------------------------------------------------------------------
    console.log("\n>>> [TEST H] Testing Permanent Record Keeping across Re-connection...");
    // Disconnect and reconnect Prisma client
    await prisma.$disconnect();
    await prisma.$connect();

    const persistentBiz = await prisma.business.findUnique({
      where: { id: testBizId },
    });

    const persistentAnnouncement = await prisma.partnerAnnouncement.findUnique({
      where: { id: createdPostId },
    });

    if (persistentBiz && persistentAnnouncement) {
      results["TEST_H_DATA_PERSISTENCE"] = {
        status: "PASS",
        details: "All created records remain securely and permanently stored in Supabase PostgreSQL across connection pools.",
        evidence: {
          businessId: persistentBiz.id,
          businessName: persistentBiz.name,
          announcementId: persistentAnnouncement.id,
          announcementTitle: persistentAnnouncement.title,
        },
      };
      console.log("✓ TEST H PASSED: Data permanently retained in Supabase PostgreSQL across disconnect/reconnect.");
    } else {
      results["TEST_H_DATA_PERSISTENCE"] = {
        status: "FAIL",
        details: "Permanent data persistence check failed.",
      };
    }

    // -------------------------------------------------------------------------
    // Post-Test Cleanup
    // -------------------------------------------------------------------------
    console.log("\n>>> Cleaning up test business and test announcement...");
    await prisma.businessHour.deleteMany({ where: { businessId: testBizId } });
    await prisma.product.deleteMany({ where: { businessId: testBizId } });
    await prisma.verificationRecord.deleteMany({ where: { businessId: testBizId } });
    await prisma.auditLog.deleteMany({ where: { entityId: testBizId } });
    await prisma.business.delete({ where: { id: testBizId } });
    await prisma.partnerAnnouncement.delete({ where: { id: createdPostId } });
    console.log("✓ Controlled test records safely cleaned up from Supabase.");

  } catch (err: any) {
    console.error("FATAL TEST ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log("FINAL TEST MATRIX RESULTS:");
  console.log("================================================================================");
  console.log(JSON.stringify(results, null, 2));
}

run();
