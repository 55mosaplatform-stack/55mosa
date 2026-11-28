/**
 * 55 MOSA — Media Fallback & Visual Discovery Engine
 * 
 * Operating Doctrine: IMPROVE 55 MOSA; DO NOT CHANGE 55 MOSA.
 * 
 * Provides authentic, high-quality, category-specific visual media fallbacks
 * and a robust resolution cascade so that every business and product on 55 MOSA
 * presents a compelling, professional visual identity across desktop and mobile.
 */

import { isVideoMedia, isLegacyBagPlaceholder } from "./media-upload";

// Curated, high-resolution, CDN-backed imagery representing Rwandan commerce and micro-enterprise trades
export const CATEGORY_FALLBACK_COVERS: Record<string, string> = {
  // Retail & Grocery
  retail_shops: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1200&auto=format&fit=crop&q=80",
  food_grocery: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&auto=format&fit=crop&q=80",
  home_appliances_goods: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1200&auto=format&fit=crop&q=80",
  kiosks_stationery: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=1200&auto=format&fit=crop&q=80",

  // Food & Dining
  food_restaurant: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80",
  restaurants_cafes: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80",
  bakeries_milk_bars: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&auto=format&fit=crop&q=80",
  bars_local_beverages: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80",

  // Fashion & Apparel
  fashion_apparel: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&auto=format&fit=crop&q=80",
  tailoring_clothing: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1200&auto=format&fit=crop&q=80",
  footwear_leather: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1200&auto=format&fit=crop&q=80",
  jewelry_accessories: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=1200&auto=format&fit=crop&q=80",

  // Personal Care & Beauty
  beauty_personal_care: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&auto=format&fit=crop&q=80",
  salon_barber: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&auto=format&fit=crop&q=80",
  spa_wellness: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&auto=format&fit=crop&q=80",

  // Tech, Electronics & Repair
  phone_electronics: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=1200&auto=format&fit=crop&q=80",
  phone_repair: "https://images.unsplash.com/photo-1597740985671-2a8a3b80532e?w=1200&auto=format&fit=crop&q=80",
  computers_office_tech: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80",

  // Hardware & Construction
  hardware_construction: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&auto=format&fit=crop&q=80",
  building_materials: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&auto=format&fit=crop&q=80",
  plumbing_electrical: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&auto=format&fit=crop&q=80",

  // Automotive & Mechanics
  mechanic_repair: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=1200&auto=format&fit=crop&q=80",
  auto_mechanics: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=1200&auto=format&fit=crop&q=80",
  moto_parts: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=1200&auto=format&fit=crop&q=80",

  // Agriculture & Veterinary
  agriculture_produce: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1200&auto=format&fit=crop&q=80",
  agro_inputs_seeds: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1200&auto=format&fit=crop&q=80",
  veterinary_livestock: "https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=1200&auto=format&fit=crop&q=80",

  // Healthcare & Pharmacy
  pharmacy_health: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&auto=format&fit=crop&q=80",
  pharmacy_retail: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=1200&auto=format&fit=crop&q=80",
  clinics_laboratories: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&auto=format&fit=crop&q=80",

  // Creative Arts & Media
  creative_art_media: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1200&auto=format&fit=crop&q=80",
  crafts_pottery: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=1200&auto=format&fit=crop&q=80",
  photography_video: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1200&auto=format&fit=crop&q=80",

  // Home & Property
  home_property: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80",
  interior_furnishing: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&auto=format&fit=crop&q=80",

  // Services
  services: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&auto=format&fit=crop&q=80",
  business_secretarial: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1200&auto=format&fit=crop&q=80",
  irembo_financial: "https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=1200&auto=format&fit=crop&q=80",

  // Default Commerce
  default: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80",
  other_business: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80",
};

// Curated product / service item fallback imagery
export const PRODUCT_FALLBACK_IMAGES: Record<string, string> = {
  retail_shops: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80",
  food_grocery: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80",
  food_restaurant: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
  fashion_apparel: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80",
  phone_electronics: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
  beauty_personal_care: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80",
  hardware_construction: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=600&auto=format&fit=crop&q=80",
  mechanic_repair: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&auto=format&fit=crop&q=80",
  agriculture_produce: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80",
  pharmacy_health: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
  creative_art_media: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&auto=format&fit=crop&q=80",
  home_property: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop&q=80",
  services: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop&q=80",
  service_default: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop&q=80",
  product_default: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
};

/**
 * Returns an authentic, high-quality cover photo tailored to the business category.
 */
export function getCategoryFallbackCover(category?: string | null): string {
  if (!category) return CATEGORY_FALLBACK_COVERS.default;
  const cleanCat = category.trim().toLowerCase();
  return CATEGORY_FALLBACK_COVERS[cleanCat] || CATEGORY_FALLBACK_COVERS.default;
}

/**
 * Returns an authentic product or service fallback image when a product lacks an uploaded photo.
 */
export function getProductFallbackImage(category?: string | null, isService?: boolean): string {
  if (isService) {
    return PRODUCT_FALLBACK_IMAGES.service_default;
  }
  if (!category) return PRODUCT_FALLBACK_IMAGES.product_default;
  const cleanCat = category.trim().toLowerCase();
  return PRODUCT_FALLBACK_IMAGES[cleanCat] || PRODUCT_FALLBACK_IMAGES.product_default;
}

export interface VisualMediaResolution {
  url: string;
  source: "EXPLICIT_COVER" | "MEDIA_COVER" | "GALLERY_PHOTO" | "PRODUCT_IMAGE" | "LOGO" | "CATEGORY_FALLBACK";
  isVideo: boolean;
  isFallback: boolean;
}

/**
 * Executes the visual media priority cascade:
 * 1. Explicit business cover image or video (if non-placeholder)
 * 2. Dedicated BusinessMedia record marked as isCover
 * 3. Verified business gallery photo
 * 4. First product or service item photo
 * 5. Business logo (if present)
 * 6. High-quality category-tailored fallback
 */
export function resolveBusinessVisualMedia(business: {
  coverImage?: string | null;
  photos?: string[];
  media?: any[];
  products?: any[];
  logo?: string | null;
  category?: string | null;
  mainCategory?: string | null;
}): VisualMediaResolution {
  // 1. Explicit business coverImage
  if (business.coverImage && !isLegacyBagPlaceholder(business.coverImage)) {
    return {
      url: business.coverImage,
      source: "EXPLICIT_COVER",
      isVideo: isVideoMedia(business.coverImage),
      isFallback: false,
    };
  }

  // 2. BusinessMedia relation with isCover: true
  const rawMediaList = Array.isArray(business.media) ? business.media : [];
  const coverMedia = rawMediaList.find(
    (m: any) => m && m.isCover && m.url && !isLegacyBagPlaceholder(m.url) && m.moderationStatus !== "REMOVED"
  );
  if (coverMedia?.url) {
    return {
      url: coverMedia.url,
      source: "MEDIA_COVER",
      isVideo: coverMedia.mediaType === "VIDEO" || isVideoMedia(coverMedia.url),
      isFallback: false,
    };
  }

  // 3. First non-placeholder photo in photos or media
  const validPhoto = Array.isArray(business.photos)
    ? business.photos.find((p) => p && !isLegacyBagPlaceholder(p))
    : undefined;
  if (validPhoto) {
    return {
      url: validPhoto,
      source: "GALLERY_PHOTO",
      isVideo: isVideoMedia(validPhoto),
      isFallback: false,
    };
  }

  const anyMedia = rawMediaList.find(
    (m: any) => m && m.url && !isLegacyBagPlaceholder(m.url) && m.moderationStatus !== "REMOVED"
  );
  if (anyMedia?.url) {
    return {
      url: anyMedia.url,
      source: "GALLERY_PHOTO",
      isVideo: anyMedia.mediaType === "VIDEO" || isVideoMedia(anyMedia.url),
      isFallback: false,
    };
  }

  // 4. First product with valid image
  const productsList = Array.isArray(business.products) ? business.products : [];
  const productWithImage = productsList.find(
    (p: any) => p && p.mediaUrl && !isLegacyBagPlaceholder(p.mediaUrl)
  );
  if (productWithImage?.mediaUrl) {
    return {
      url: productWithImage.mediaUrl,
      source: "PRODUCT_IMAGE",
      isVideo: isVideoMedia(productWithImage.mediaUrl),
      isFallback: false,
    };
  }

  // 5. Business logo (if present)
  if (business.logo && !isLegacyBagPlaceholder(business.logo)) {
    return {
      url: business.logo,
      source: "LOGO",
      isVideo: false,
      isFallback: false,
    };
  }

  // 6. Category-specific curated fallback
  const fallbackCat = business.mainCategory || business.category;
  return {
    url: getCategoryFallbackCover(fallbackCat),
    source: "CATEGORY_FALLBACK",
    isVideo: false,
    isFallback: true,
  };
}
