import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('--- Applying CustomCategory schema to PostgreSQL ---');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CustomCategory" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "nameRw" TEXT,
      "slug" TEXT NOT NULL,
      "normalizedName" TEXT NOT NULL,
      "parentCategory" TEXT DEFAULT 'other_business',
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "usageCount" INTEGER NOT NULL DEFAULT 1,
      "createdById" TEXT,
      "reviewedById" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "adminNotes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "CustomCategory_pkey" PRIMARY KEY ("id")
    );
  `);
  console.log('Created CustomCategory table');

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomCategory_slug_key" ON "CustomCategory"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomCategory_normalizedName_key" ON "CustomCategory"("normalizedName");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CustomCategory_slug_idx" ON "CustomCategory"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CustomCategory_normalizedName_idx" ON "CustomCategory"("normalizedName");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CustomCategory_status_idx" ON "CustomCategory"("status");
  `);
  console.log('Created CustomCategory indexes');

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "customCategoryId" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Business_customCategoryId_idx" ON "Business"("customCategoryId");
  `);
  console.log('Added customCategoryId column and index to Business');

  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomCategory_createdById_fkey') THEN
          ALTER TABLE "CustomCategory" ADD CONSTRAINT "CustomCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Business_customCategoryId_fkey') THEN
          ALTER TABLE "Business" ADD CONSTRAINT "Business_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "CustomCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log('Applied foreign key constraints');
  } catch (err: any) {
    console.warn('Foreign key check note:', err.message);
  }

  // Verify
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'CustomCategory'
  `);
  console.log('Verified CustomCategory columns in DB:', cols);
}

main()
  .then(() => {
    console.log('Schema migration complete!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  });
