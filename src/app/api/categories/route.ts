import { NextResponse } from "next/server";
import { CANONICAL_TAXONOMY } from "@/lib/taxonomy";
import { getActiveCustomCategories, findOrCreateCustomCategory, validateCustomCategoryInput } from "@/lib/categories";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeCustom = searchParams.get("includeCustom") !== "false";

    const customCategories = includeCustom ? await getActiveCustomCategories() : [];

    // Map custom categories into a friendly structure for frontends
    const formattedCustom = customCategories.map((c) => ({
      id: c.slug,
      dbId: c.id,
      name: c.name,
      nameRw: c.nameRw || c.name,
      isCustom: true,
      parentCategory: c.parentCategory,
      usageCount: c.usageCount,
      icon: "Tag",
      subcategories: [],
    }));

    return NextResponse.json({
      success: true,
      canonical: CANONICAL_TAXONOMY,
      custom: formattedCustom,
      totalCanonical: CANONICAL_TAXONOMY.length,
      totalCustom: formattedCustom.length,
    });
  } catch (error: any) {
    console.error("[Categories API GET Error]:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, nameRw, parentCategory, description } = body;

    const validation = validateCustomCategoryInput(name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const user = await getCurrentUser();

    const category = await findOrCreateCustomCategory({
      name,
      nameRw,
      parentCategory,
      description,
      createdById: user?.id || null,
    });

    return NextResponse.json({
      success: true,
      category,
    });
  } catch (error: any) {
    console.error("[Categories API POST Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register custom category" },
      { status: 500 }
    );
  }
}
