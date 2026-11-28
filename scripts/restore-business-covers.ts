import { prisma } from '../src/lib/prisma';
import { getCategoryFallbackCover } from '../src/lib/media-fallback';

async function main() {
  console.log('=== 55 MOSA Business Cover Image Restoration ===');

  const businesses = await prisma.business.findMany({
    include: {
      products: {
        where: { isArchived: false, moderationStatus: { not: 'REMOVED' } },
        orderBy: { createdAt: 'asc' },
      },
      media: {
        where: { moderationStatus: { not: 'REMOVED' } },
      },
    },
  });

  console.log(`Found ${businesses.length} total businesses in database.`);

  let updatedCount = 0;

  for (const b of businesses) {
    console.log(`\nEvaluating Business: "${b.name}" (ID: ${b.id})`);
    console.log(`Current coverImage: ${b.coverImage ? (b.coverImage.startsWith('data:') ? 'DATA_URI (' + b.coverImage.length + ' chars)' : b.coverImage) : 'NULL'}`);
    console.log(`Products with mediaUrl: ${b.products.filter(p => Boolean(p.mediaUrl)).length}/${b.products.length}`);
    console.log(`BusinessMedia records: ${b.media.length}`);

    if (!b.coverImage || b.coverImage.includes('photo-1544816155-12df9643f363')) {
      // 1. Check for dedicated BusinessMedia marked as cover
      const mediaCover = b.media.find(m => m.isCover && m.url && !m.url.includes('photo-1544816155-12df9643f363'));
      if (mediaCover) {
        await prisma.business.update({
          where: { id: b.id },
          data: { coverImage: mediaCover.url },
        });
        console.log(`-> Restored coverImage from BusinessMedia: ${mediaCover.url.slice(0, 50)}...`);
        updatedCount++;
        continue;
      }

      // 2. Check for any BusinessMedia photo
      const anyMedia = b.media.find(m => m.mediaType !== 'VIDEO' && m.url && !m.url.includes('photo-1544816155-12df9643f363'));
      if (anyMedia) {
        await prisma.business.update({
          where: { id: b.id },
          data: { coverImage: anyMedia.url },
        });
        console.log(`-> Restored coverImage from BusinessMedia photo: ${anyMedia.url.slice(0, 50)}...`);
        updatedCount++;
        continue;
      }

      // 3. Check for product with mediaUrl
      const productWithMedia = b.products.find(p => p.mediaUrl && !p.mediaUrl.includes('photo-1544816155-12df9643f363'));
      if (productWithMedia?.mediaUrl) {
        await prisma.business.update({
          where: { id: b.id },
          data: { coverImage: productWithMedia.mediaUrl },
        });
        console.log(`-> Restored coverImage from Primary Product "${productWithMedia.name}"`);
        updatedCount++;
        continue;
      }

      // 4. Fall back to curated category cover
      const fallbackUrl = getCategoryFallbackCover(b.mainCategory || b.category);
      await prisma.business.update({
        where: { id: b.id },
        data: { coverImage: fallbackUrl },
      });
      console.log(`-> Restored coverImage with category fallback: ${fallbackUrl}`);
      updatedCount++;
    } else {
      console.log('-> Already has authentic coverImage.');
    }
  }

  console.log(`\n=== Image Restoration Completed: ${updatedCount} businesses updated. ===`);

  // Final verification
  const check = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      coverImage: true,
    },
  });

  const missingCover = check.filter(b => !b.coverImage);
  console.log(`Businesses with missing cover: ${missingCover.length}`);
  if (missingCover.length > 0) {
    console.error('CRITICAL: Some businesses still missing cover!');
  } else {
    console.log('SUCCESS: 100% of businesses have a valid cover photo!');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error during image restoration:', e);
    process.exit(1);
  });
