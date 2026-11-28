/**
 * 55 MOSA — Image Restoration & Self-Service Category Verification Suite
 * 
 * Operating Doctrine: IMPROVE 55 MOSA; DO NOT CHANGE 55 MOSA.
 * Production Rule: PRODUCTION IS NOT A TESTING ENVIRONMENT.
 */

import { prisma } from '../src/lib/prisma';
import { serializePublicBusiness } from '../src/lib/public-serializer';
import { formatBusinessRecord } from '../src/lib/format-business';
import { resolveBusinessVisualMedia, getCategoryFallbackCover, getProductFallbackImage } from '../src/lib/media-fallback';
import { normalizeCategoryName, slugifyCategory, findOrCreateCustomCategory, validateCustomCategoryInput } from '../src/lib/categories';

async function runTests() {
  console.log('===============================================================');
  console.log('55 MOSA — IMAGES & SELF-SERVICE CATEGORY VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? '— ' + detail : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: Serialization of base64 Product Images
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: Product Images Serialization ---');
  const mockProductDataUri = 'data:image/jpeg;base64,' + 'A'.repeat(12000); // 12KB Data URI
  const mockBusiness = {
    id: 'test-biz-1',
    name: 'Test Bakery',
    category: 'food_restaurant',
    coverImage: 'https://images.unsplash.com/photo-test',
    products: [
      {
        id: 'prod-1',
        name: 'Fresh Bread',
        price: 1500,
        mediaUrl: mockProductDataUri,
        mediaType: 'IMAGE',
        isService: false,
      },
    ],
  };

  const serialized = serializePublicBusiness(mockBusiness);
  assert(
    serialized.products[0].mediaUrl === mockProductDataUri,
    'Large Data URI product image (>8192 bytes) is preserved during serialization'
  );

  // Verify real database products
  const realBusinesses = await prisma.business.findMany({
    include: { products: true, media: true },
  });

  const totalProducts = realBusinesses.reduce((acc, b) => acc + b.products.length, 0);
  const productsWithImages = realBusinesses.reduce(
    (acc, b) => acc + b.products.filter(p => Boolean(p.mediaUrl)).length,
    0
  );

  console.log(`Real database businesses: ${realBusinesses.length}, Total products: ${totalProducts}, Products with media: ${productsWithImages}`);
  assert(
    productsWithImages > 0,
    `Database has active products with authentic media (${productsWithImages} products)`
  );

  for (const b of realBusinesses) {
    const pub = serializePublicBusiness(b);
    for (const p of pub.products) {
      const orig = b.products.find(op => op.id === p.id);
      if (orig?.mediaUrl) {
        assert(
          p.mediaUrl === orig.mediaUrl,
          `Public product "${p.name}" in "${b.name}" retains mediaUrl in public serializer`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2: Business Cover Image Resolution & Category Fallback
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Business Cover Photos Resolution ---');
  for (const b of realBusinesses) {
    const formatted = formatBusinessRecord(b);
    assert(
      Boolean(formatted.coverImage) && !formatted.coverImage.includes('photo-1544816155-12df9643f363'),
      `Business "${b.name}" has valid coverImage: ${formatted.coverImage?.slice(0, 45)}...`
    );
  }

  // Test resolution priority cascade
  const fallbackCover = getCategoryFallbackCover('retail_shops');
  assert(Boolean(fallbackCover) && fallbackCover.startsWith('https://'), 'Category fallback cover exists for retail_shops');

  const testCascadeNoCover = resolveBusinessVisualMedia({
    category: 'fashion_apparel',
    products: [{ mediaUrl: 'https://test.com/product.jpg' }],
  });
  assert(
    testCascadeNoCover.source === 'PRODUCT_IMAGE' && testCascadeNoCover.url === 'https://test.com/product.jpg',
    'Resolver cascades to product image when explicit cover is null'
  );

  const testCascadePureFallback = resolveBusinessVisualMedia({
    category: 'pharmacy_health',
  });
  assert(
    testCascadePureFallback.source === 'CATEGORY_FALLBACK' && Boolean(testCascadePureFallback.url),
    'Resolver cascades to category fallback when no media exists'
  );

  // -------------------------------------------------------------------------
  // TEST 3: Self-Service Category Normalization & Deduplication
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Self-Service Category Engine ---');
  assert(
    normalizeCategoryName('  Commercial   Drone   Surveying! ') === 'commercial drone surveying',
    'Category name normalized and whitespace collapsed'
  );
  assert(
    slugifyCategory('Commercial Drone Surveying') === 'commercial_drone_surveying',
    'Slug generated correctly'
  );

  const val1 = validateCustomCategoryInput('A');
  assert(!val1.valid, 'Single letter category rejected');

  const val2 = validateCustomCategoryInput('123456');
  assert(!val2.valid, 'Pure numeric category rejected');

  const val3 = validateCustomCategoryInput('Commercial Drone Surveying');
  assert(val3.valid, 'Valid custom category accepted');

  // Test findOrCreateCustomCategory in database
  const testCatName = `Automated Test Category ${Date.now()}`;
  const customCat = await findOrCreateCustomCategory({
    name: testCatName,
    parentCategory: 'services',
  });

  assert(
    !customCat.isCanonical && customCat.name === testCatName && customCat.status === 'ACTIVE',
    'CustomCategory successfully created in database with ACTIVE status'
  );

  // Deduplication test: same normalized name should reuse and increment usageCount
  const reusedCat = await findOrCreateCustomCategory({
    name: `  ${testCatName.toLowerCase()}  `,
    parentCategory: 'services',
  });

  assert(
    reusedCat.id === customCat.id,
    'Duplicate custom category name reused existing record'
  );

  const fetchedFromDb = await prisma.customCategory.findUnique({
    where: { id: customCat.id },
  });
  assert(
    fetchedFromDb?.usageCount === 2,
    'CustomCategory usageCount incremented on reuse'
  );

  // Canonical match test: if user enters canonical category name, maps to canonical
  const canonicalAttempt = await findOrCreateCustomCategory({
    name: 'Retail, Shops & General Commerce',
  });
  assert(
    canonicalAttempt.isCanonical && canonicalAttempt.id === 'retail_shops',
    'Canonical category match returns canonical taxonomy ID without creating duplicate'
  );

  // -------------------------------------------------------------------------
  // TEST 4: Cleanup of Synthetic Test Category
  // -------------------------------------------------------------------------
  await prisma.customCategory.delete({
    where: { id: customCat.id },
  });
  console.log('[CLEANUP] Deleted test category from database.');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  });
