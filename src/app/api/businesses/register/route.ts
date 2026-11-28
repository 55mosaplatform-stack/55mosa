import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/sms/normalize";
import { createSessionToken, setSessionCookie, hashPassword } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { sendBusinessSMS } from "@/lib/sms";
import { Role, LocationSource, LocationVerificationStatus } from "@prisma/client";
import { 
  validateCategoryHierarchy, 
  ALL_MAIN_CATEGORIES, 
  ALL_SUBCATEGORIES, 
  ALL_BUSINESS_TYPES 
} from "@/lib/taxonomy";
import { findOrCreateCustomCategory, validateCustomCategoryInput } from "@/lib/categories";
import { getCountryConfig } from "@/lib/country-address-config";
import { invalidateBusinessesFeedCache } from "@/app/api/businesses/route";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      nameRw,
      category,
      categoryDisplay,
      categoryDisplayRw,
      description,
      descriptionRw,
      ownerName,
      phone,
      whatsapp,
      email,
      password,
      province,
      district,
      sector,
      cell,
      localArea,
      nearestLandmark,
      streetName,
      nearbyPlace,
      locationDescription,
      latitude,
      longitude,
      locationAccuracy,
      products = [],
      logo,
      coverImage,
      customCategoryName,
      secondaryActivities = [],
    } = body;

    // 1. Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }

    if (!ownerName || typeof ownerName !== "string" || !ownerName.trim()) {
      return NextResponse.json({ error: "Owner name is required" }, { status: 400 });
    }

    const hasCustomCategory = Boolean(
      (customCategoryName && typeof customCategoryName === "string" && customCategoryName.trim()) ||
      (body.isCustomCategory && customCategoryName)
    );

    if (hasCustomCategory) {
      const catVal = validateCustomCategoryInput(customCategoryName);
      if (!catVal.valid) {
        return NextResponse.json({ error: catVal.error }, { status: 400 });
      }
    } else {
      const effectiveCategory = (category && typeof category === "string") ? category : (body.mainCategory && typeof body.mainCategory === "string") ? body.mainCategory : null;
      if (!effectiveCategory) {
        return NextResponse.json({ error: "Business category is required" }, { status: 400 });
      }

      // 1.1 Controlled 3-Tier Category Validation
      const mainCategory = body.mainCategory || effectiveCategory;
      const subCategory = body.subCategory || null;
      const businessType = body.businessType || null;

      const taxonomyValidation = validateCategoryHierarchy(mainCategory, subCategory, businessType);
      if (!taxonomyValidation.isValid) {
        return NextResponse.json(
          { error: taxonomyValidation.error || "Invalid business category classification." },
          { status: 400 }
        );
      }
    }

    // 1.2 Structured Location Validation
    if (!sector || typeof sector !== "string" || !sector.trim()) {
      return NextResponse.json({ error: "Structured Sector / Locality is required" }, { status: 400 });
    }

    if (!cell || typeof cell !== "string" || !cell.trim()) {
      return NextResponse.json({ error: "Structured Cell / Neighborhood is required" }, { status: 400 });
    }

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Owner phone number is required" }, { status: 400 });
    }

    if (!nearestLandmark || typeof nearestLandmark !== "string" || !nearestLandmark.trim()) {
      return NextResponse.json({ error: "Nearest walking landmark is required for ground discovery" }, { status: 400 });
    }

    // 2. Normalize Phone Number (Supports Rwanda local & International formats)
    const phoneNorm = normalizePhoneNumber(phone);
    if (!phoneNorm.isValid || !phoneNorm.e164) {
      return NextResponse.json(
        { error: phoneNorm.error || "Invalid phone number format. Please enter a valid number." },
        { status: 400 }
      );
    }
    const cleanPhone = phoneNorm.e164;

    // Optional WhatsApp normalization
    let cleanWhatsapp: string | null = null;
    if (whatsapp && typeof whatsapp === "string" && whatsapp.trim()) {
      const waNorm = normalizePhoneNumber(whatsapp);
      if (!waNorm.isValid || !waNorm.e164) {
        return NextResponse.json(
          { error: waNorm.error || "Invalid WhatsApp phone number format." },
          { status: 400 }
        );
      }
      cleanWhatsapp = waNorm.e164;
    } else {
      cleanWhatsapp = cleanPhone;
    }

    const hasCoordinates = typeof latitude === "number" && typeof longitude === "number" && !isNaN(latitude) && !isNaN(longitude);
    const hasAddressDescription = Boolean(
      (nearestLandmark && typeof nearestLandmark === "string" && nearestLandmark.trim().length >= 2) ||
      (locationDescription && typeof locationDescription === "string" && locationDescription.trim().length >= 3)
    );
    const coordinatesConfirmed = Boolean(body.hasConfirmedCoordinates) || hasAddressDescription;
    const hasGps = hasCoordinates && typeof locationAccuracy === "number";

    // Strict validation: Coordinates must be confirmed by the user (pin adjustment, geocoding, landmark/directions, or GPS)
    // Country map viewport viewing hubs must never be saved as unconfirmed business locations.
    const regCountry = body.country && typeof body.country === "string" ? body.country.trim() : "Rwanda";
    const countryConfig = getCountryConfig(regCountry);
    const isRw = countryConfig.code === "RW";

    const isCountryHubCoord = hasCoordinates &&
      Math.abs(Number(latitude) - countryConfig.defaultCenter.lat) < 0.0001 &&
      Math.abs(Number(longitude) - countryConfig.defaultCenter.lng) < 0.0001;

    if (!coordinatesConfirmed && !hasGps) {
      return NextResponse.json(
        {
          error: "Business location coordinates must be confirmed on the map or by address description. A country map viewing position cannot be saved as a business location.",
        },
        { status: 400 }
      );
    }

    if (isCountryHubCoord && !body.explicitHubConfirmation && !hasAddressDescription && !sector) {
      return NextResponse.json(
        {
          error: "Coordinates match a country map viewing hub. Please select your specific business street, building, or landmark location.",
        },
        { status: 400 }
      );
    }

    const resolvedProvinceId = body.provinceId || null;
    let resolvedDistrictId = body.districtId || null;
    let resolvedSectorId = body.sectorId || null;
    let resolvedCellId = body.cellId || null;

    // Resolve geographic entities dynamically to guarantee accurate linking
    let resolvedLat = hasCoordinates ? Number(latitude) : null;
    let resolvedLng = hasCoordinates ? Number(longitude) : null;
    let isCentroidAssigned = false;

    if (sector && typeof sector === "string") {
      const cleanSectorName = sector.trim();
      const dbSector = await prisma.geographicSector.findFirst({
        where: { name: { equals: cleanSectorName, mode: "insensitive" } },
        include: { districtRel: true },
      });
      if (dbSector) {
        if (!resolvedSectorId) resolvedSectorId = dbSector.id;
        if (!resolvedDistrictId) resolvedDistrictId = dbSector.districtId;
        if (resolvedLat === null || resolvedLng === null || isCountryHubCoord) {
          resolvedLat = dbSector.latitude;
          resolvedLng = dbSector.longitude;
          isCentroidAssigned = true;
        }
      }
    }

    if (district && typeof district === "string" && !resolvedDistrictId) {
      const cleanDistrictName = district.trim();
      const dbDistrict = await prisma.geographicDistrict.findFirst({
        where: { name: { equals: cleanDistrictName, mode: "insensitive" } },
      });
      if (dbDistrict) {
        resolvedDistrictId = dbDistrict.id;
        if (resolvedLat === null || resolvedLng === null) {
          resolvedLat = dbDistrict.latitude;
          resolvedLng = dbDistrict.longitude;
          isCentroidAssigned = true;
        }
      }
    }

    if (cell && typeof cell === "string" && resolvedSectorId && !resolvedCellId) {
      const cleanCellName = cell.trim();
      const dbCell = await prisma.geographicCell.findFirst({
        where: {
          sectorId: resolvedSectorId,
          name: { equals: cleanCellName, mode: "insensitive" },
        },
      });
      if (dbCell) {
        resolvedCellId = dbCell.id;
      }
    }

    // Precise separation: Real GPS device vs manual pin adjustment vs text address/centroid fallback
    // Entering a landmark or directions confirms address presence but MUST NOT falsely certify exact GPS coordinates
    const hasExactGps = hasCoordinates && typeof locationAccuracy === "number" && locationAccuracy > 0 && locationAccuracy <= 50;
    const isManualPin = Boolean(body.pinManuallyAdjusted || body.locationSource === "MAP_SELECTION" || body.locationSource === "AGENT_PIN") && !isCountryHubCoord;

    let locSource: LocationSource;
    let locVerification: LocationVerificationStatus;

    if (hasExactGps && !isCentroidAssigned) {
      locSource = LocationSource.GPS_DEVICE;
      locVerification = LocationVerificationStatus.AGENT_CAPTURED;
    } else if (isManualPin && !isCentroidAssigned) {
      locSource = LocationSource.MAP_SELECTION;
      locVerification = LocationVerificationStatus.BUSINESS_CONFIRMED;
    } else {
      // Landmark, directions, text address, or sector/district centroid fallback
      locSource = LocationSource.OWNER_REPORTED;
      locVerification = LocationVerificationStatus.UNVERIFIED;
    }
    const accuracy = (hasExactGps && !isCentroidAssigned) ? Number(locationAccuracy) : null;

    const regProvince = province && typeof province === "string" ? province.trim() : null;
    let computedAddressNote = localArea?.trim() || null;
    if (!isRw) {
      const prefix = `[Country: ${countryConfig.name}${regProvince ? ` | Region: ${regProvince}` : ""}]`;
      computedAddressNote = computedAddressNote ? `${prefix} ${computedAddressNote}` : prefix;
    }
    if (isCentroidAssigned || (!hasExactGps && !isManualPin)) {
      const precisionTag = "[Precision: Approximate Area / Landmark Reference - Pending Exact GPS Audit]";
      computedAddressNote = computedAddressNote ? `${precisionTag} ${computedAddressNote}` : precisionTag;
    }
    if (Array.isArray(secondaryActivities) && secondaryActivities.length > 0) {
      const activitiesTag = `[Activities: ${secondaryActivities.filter((a: any) => typeof a === "string" && a.trim()).join(", ")}]`;
      computedAddressNote = computedAddressNote ? `${activitiesTag} ${computedAddressNote}` : activitiesTag;
    }

    if (resolvedLat === null || resolvedLng === null) {
      return NextResponse.json(
        { error: "Business location coordinates are required. Please confirm your location on the map." },
        { status: 400 }
      );
    }
    const finalLat: number = resolvedLat;
    const finalLng: number = resolvedLng;

    // 3-7. Atomic Transaction: User Account + Business + Products + AuditLog
    const { user, business } = await prisma.$transaction(async (tx) => {
      let u = await tx.user.findUnique({
        where: { phone: cleanPhone },
      });

      if (u) {
        if (u.role === Role.CUSTOMER) {
          u = await tx.user.update({
            where: { id: u.id },
            data: { 
              role: Role.BUSINESS_OWNER,
              language: body.preferredLanguage || u.language || "rw",
            },
          });
        }
      } else {
        const effectivePassword = password && password.length >= 6 ? password : `Mosa@${cleanPhone.slice(-4)}`;
        const passwordHash = await hashPassword(effectivePassword);

        u = await tx.user.create({
          data: {
            phone: cleanPhone,
            name: ownerName && ownerName.trim() ? ownerName.trim() : `${name.trim()} Owner`,
            email: email && typeof email === "string" && email.trim() ? email.trim() : undefined,
            role: Role.BUSINESS_OWNER,
            passwordHash,
            community: isRw
              ? (sector?.trim() || district?.trim() || "Kigali")
              : (district?.trim() || province?.trim() || countryConfig.name),
            language: body.preferredLanguage || "rw",
            status: "ACTIVE",
            referralCode: `MOSA-${cleanPhone.slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`,
          },
        });
      }

      let resolvedCustomCat: any = null;
      if (hasCustomCategory) {
        resolvedCustomCat = await findOrCreateCustomCategory(
          {
            name: customCategoryName.trim(),
            parentCategory: body.mainCategory || "other_business",
            createdById: u.id,
          },
          tx
        );
      }

      const mainCategory = hasCustomCategory ? (body.mainCategory || "other_business") : (body.mainCategory || category || "services");
      const subCategory = hasCustomCategory ? null : (body.subCategory || null);
      const businessType = hasCustomCategory ? null : (body.businessType || null);

      const resolvedMain = ALL_MAIN_CATEGORIES[mainCategory];
      const resolvedType = businessType ? ALL_BUSINESS_TYPES[businessType] : null;
      const resolvedSub = subCategory ? ALL_SUBCATEGORIES[subCategory] : null;

      const finalCatDisplay = resolvedCustomCat
        ? resolvedCustomCat.name
        : (resolvedType?.name || resolvedSub?.name || resolvedMain?.name || categoryDisplay || "Local Business");
      const finalCatDisplayRw = resolvedCustomCat
        ? (resolvedCustomCat.nameRw || resolvedCustomCat.name)
        : (resolvedType?.nameRw || resolvedSub?.nameRw || resolvedMain?.nameRw || categoryDisplayRw || "Ubucuruzi bw'Agace");

      const b = await tx.business.create({
        data: {
          name: name.trim(),
          nameRw: nameRw?.trim() || name.trim(),
          mainCategory: mainCategory,
          category: resolvedCustomCat ? resolvedCustomCat.slug : mainCategory,
          customCategoryId: resolvedCustomCat ? resolvedCustomCat.id : null,
          subCategory: subCategory,
          businessType: businessType,
          businessTypeDisplay: resolvedCustomCat ? resolvedCustomCat.name : (resolvedType?.name || null),
          businessTypeDisplayRw: resolvedCustomCat ? (resolvedCustomCat.nameRw || resolvedCustomCat.name) : (resolvedType?.nameRw || null),
          categoryDisplay: finalCatDisplay,
          categoryDisplayRw: finalCatDisplayRw,
          description: description?.trim() || "Neighborhood micro-business registered directly on MOSA.",
          descriptionRw: descriptionRw?.trim() || description?.trim() || "Ubucuruzi bw'agace bwanditswe kuri MOSA.",
          phone: cleanPhone,
          whatsapp: cleanWhatsapp,
          email: email && typeof email === "string" && email.trim() ? email.trim() : null,
          logo: logo && typeof logo === "string" ? logo.trim() : null,
          ownerId: u.id,
          sector: sector?.trim() || (isRw ? "Unspecified" : (district?.trim() || countryConfig.name)),
          cell: cell?.trim() || (isRw ? "Unspecified" : (streetName?.trim() || nearestLandmark?.trim() || countryConfig.name)),
          district: district?.trim() || (isRw ? "Gasabo" : (province?.trim() || countryConfig.name)),
          addressNote: computedAddressNote,
          nearestLandmark: nearestLandmark?.trim() || null,
          streetName: streetName?.trim() || null,
          nearbyPlace: nearbyPlace?.trim() || null,
          locationDescription: locationDescription?.trim() || null,
          locationSource: locSource,
          locationAccuracy: hasGps ? accuracy : null,
          locationVerificationStatus: locVerification,
          latitude: finalLat,
          longitude: finalLng,
          verificationStatus: "UNVERIFIED",
          status: "PENDING",
          dataStatus: "RESEARCHED",
          source: "SELF_REGISTERED",
          provinceId: resolvedProvinceId,
          districtId: resolvedDistrictId,
          sectorId: resolvedSectorId,
          cellId: resolvedCellId,
          coverImage: coverImage && typeof coverImage === "string" ? coverImage.trim() : (body.coverImage ? body.coverImage.trim() : null),
        },
      });

      // Opening hours if provided
      if (body.openingHours && Array.isArray(body.openingHours) && body.openingHours.length > 0) {
        for (const h of body.openingHours) {
          if (h.day) {
            await tx.businessHour.create({
              data: {
                businessId: b.id,
                day: h.day,
                dayRw: h.dayRw || h.day,
                open: h.open || "08:00",
                close: h.close || "20:00",
                isClosed: Boolean(h.isClosed),
              },
            });
          }
        }
      }

      if (products && Array.isArray(products) && products.length > 0) {
        for (const p of products) {
          if (p.name && p.name.trim()) {
            const hasMedia = Boolean(p.mediaUrl && p.mediaUrl.trim());
            const resolvedCaption = hasMedia ? (p.mediaCaption?.trim() || p.name.trim() || "Item image") : null;

            const itemPrice = Number(p.price) || 0;
            const minP = p.priceMin !== undefined && p.priceMin !== null && p.priceMin !== "" ? Number(p.priceMin) : itemPrice;
            const maxP = p.priceMax !== undefined && p.priceMax !== null && p.priceMax !== "" ? Number(p.priceMax) : itemPrice;
            const isService = Boolean(p.isService);
            const isContactForPrice = Boolean(p.contactForPrice || (isService && itemPrice === 0));
            const normPriceType = p.priceType || (isContactForPrice ? "ESTIMATED" : (minP !== maxP ? "RANGE" : "FIXED"));

            await tx.product.create({
              data: {
                businessId: b.id,
                name: p.name.trim(),
                nameRw: p.nameRw?.trim() || p.name.trim(),
                description: p.description?.trim() || null,
                unit: p.unit || (isService ? "service" : "item"),
                price: itemPrice,
                priceMin: minP,
                priceMax: maxP,
                priceType: normPriceType,
                currency: p.currency ? String(p.currency).toUpperCase().trim() : "RWF",
                isService: isService,
                isEstimated: Boolean(p.isEstimated || isContactForPrice),
                category: p.category || b.category,
                isAvailable: true,
                mediaUrl: hasMedia ? p.mediaUrl.trim() : null,
                mediaType: hasMedia ? (p.mediaType || "IMAGE") : "IMAGE",
                mediaCaption: resolvedCaption,
              },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: u.id,
          action: "BUSINESS_SELF_REGISTERED",
          entityType: "BUSINESS",
          entityId: b.id,
          metadata: JSON.stringify({
            name: b.name,
            category: b.category,
            phone: u.phone,
            sector: b.sector,
            cell: b.cell,
            hasGps,
            initialStatus: "PENDING",
          }),
        },
      });

      await tx.notification.create({
        data: {
          userId: u.id,
          title: "Welcome to Your Owner Portal / Murakaza Neza",
          message: `Your business registration for "${b.name}" has been received and registered. Welcome to your Private Owner Portal! You can manage your catalog, hours, and business details here.`,
        },
      });

      return { user: u, business: b };
    });

    // 9. Generate and persist authenticated session token for the owner
    const token = await createSessionToken({
      userId: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
    });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    await setSessionCookie(token);

    // Revalidate Command Center queues so new submission appears immediately
    try {
      revalidatePath("/admin");
      invalidateBusinessesFeedCache();
    } catch {
      // Non-blocking
    }

    // 10. Truthful Welcome SMS Notification
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://55mosa.com";
      await sendBusinessSMS({
        businessId: business.id,
        recipientPhone: cleanPhone,
        templateId: "WELCOME_OWNER",
        variables: {
          businessName: business.name,
          dashboardUrl: `${appUrl}/owner/dashboard`,
        },
        language: "rw",
      });
    } catch {
      // Non-blocking: SMS gateway configuration is handled gracefully
    }

    return NextResponse.json(
      {
        success: true,
        message: "Business registered successfully and pending administrative verification",
        businessId: business.id,
        business: {
          id: business.id,
          name: business.name,
          status: business.status,
        },
        redirectUrl: "/owner/dashboard",
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Business Self-Registration Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register business. Please try again." },
      { status: 500 }
    );
  }
}
