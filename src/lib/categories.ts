/**
 * 55 MOSA — Category Taxonomy & Self-Service Category Expansion Engine
 * 
 * Operating Doctrine: IMPROVE 55 MOSA; DO NOT CHANGE 55 MOSA.
 * 
 * Allows business owners to register businesses under novel or specialized
 * micro-business categories while maintaining strict deduplication, normalization,
 * search indexing, and administrative oversight.
 */

import { prisma } from "@/lib/prisma";
import { ALL_MAIN_CATEGORIES, CANONICAL_TAXONOMY } from "@/lib/taxonomy";

/**
 * Normalizes a category name for consistent deduplication:
 * - Trims whitespace
 * - Converts to lowercase
 * - Collapses consecutive spaces into a single space
 * - Strips leading/trailing punctuation
 */
export function normalizeCategoryName(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Generates an SEO & URL-friendly slug from a category name:
 * e.g., "Commercial Drone Surveying" -> "commercial_drone_surveying"
 */
export function slugifyCategory(input: string): string {
  if (!input || typeof input !== "string") return "custom_category";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .slice(0, 50);
}

/**
 * Validates custom category input from business owners
 */
export function validateCustomCategoryInput(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Category name is required" };
  }
  const clean = name.trim();
  if (clean.length < 2) {
    return { valid: false, error: "Category name must be at least 2 characters long" };
  }
  if (clean.length > 60) {
    return { valid: false, error: "Category name must not exceed 60 characters" };
  }
  // Check that it contains at least one letter
  if (!/[a-zA-Z\u00C0-\u024F]/.test(clean)) {
    return { valid: false, error: "Category name must contain alphabetic characters" };
  }
  return { valid: true };
}

/**
 * Resolves or registers a custom category in PostgreSQL:
 * 1. Checks if it matches an existing canonical category (maps directly if matched)
 * 2. Checks if an active CustomCategory exists (normalizes and reuses, increments usage count)
 * 3. Creates a new active CustomCategory with instant activation and audit tracking
 */
export async function findOrCreateCustomCategory(params: {
  name: string;
  nameRw?: string | null;
  parentCategory?: string | null;
  createdById?: string | null;
  description?: string | null;
}, db: any = prisma) {
  const { name, nameRw, parentCategory, createdById, description } = params;
  const validation = validateCustomCategoryInput(name);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid category name");
  }

  const cleanName = name.trim();
  const normalized = normalizeCategoryName(cleanName);
  const baseSlug = slugifyCategory(cleanName);

  // 1. Check if it matches any canonical category name or ID
  const canonicalMatch = CANONICAL_TAXONOMY.find(
    (c) =>
      c.id.toLowerCase() === baseSlug ||
      normalizeCategoryName(c.name) === normalized ||
      normalizeCategoryName(c.nameRw) === normalized
  );

  if (canonicalMatch) {
    return {
      isCanonical: true,
      id: canonicalMatch.id,
      slug: canonicalMatch.id,
      name: canonicalMatch.name,
      nameRw: canonicalMatch.nameRw,
      parentCategory: canonicalMatch.id,
      status: "ACTIVE" as const,
    };
  }

  // 2. Check if already exists in CustomCategory
  const existing = await db.customCategory.findFirst({
    where: {
      OR: [
        { normalizedName: normalized },
        { slug: baseSlug },
      ],
    },
  });

  if (existing) {
    // Increment usage count and touch updated timestamp
    const updated = await db.customCategory.update({
      where: { id: existing.id },
      data: {
        usageCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return {
      isCanonical: false,
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      nameRw: updated.nameRw,
      parentCategory: updated.parentCategory,
      status: updated.status,
    };
  }

  // 3. Create novel CustomCategory with ACTIVE status for instant platform availability
  const customCat = await db.customCategory.create({
    data: {
      name: cleanName,
      nameRw: nameRw?.trim() || null,
      slug: baseSlug,
      normalizedName: normalized,
      parentCategory: parentCategory || "other_business",
      description: description?.trim() || null,
      status: "ACTIVE",
      usageCount: 1,
      createdById: createdById || null,
    },
  });

  return {
    isCanonical: false,
    id: customCat.id,
    slug: customCat.slug,
    name: customCat.name,
    nameRw: customCat.nameRw,
    parentCategory: customCat.parentCategory,
    status: customCat.status,
  };
}

/**
 * Returns all active custom categories ordered by popularity/usage count
 */
export async function getActiveCustomCategories() {
  try {
    return await prisma.customCategory.findMany({
      where: { status: "ACTIVE" },
      orderBy: [
        { usageCount: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });
  } catch (err) {
    console.error("[getActiveCustomCategories error]:", err);
    return [];
  }
}
