import { prisma } from "../src/lib/prisma";

export async function setupMfaSchema() {
  console.log("[SCHEMA] Ensuring AdminMfaProfile table exists in PostgreSQL...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminMfaProfile" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "totpSecret" TEXT,
      "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
      "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
      "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "lastUsedStep" BIGINT,
      "enrolledAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "AdminMfaProfile_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AdminMfaProfile_userId_key" ON "AdminMfaProfile"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AdminMfaProfile_userId_idx" ON "AdminMfaProfile"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdminMfaProfile_userId_fkey'
      ) THEN
        ALTER TABLE "AdminMfaProfile" ADD CONSTRAINT "AdminMfaProfile_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log("[SCHEMA] AdminMfaProfile table verified and ready in PostgreSQL.");
}

if (require.main === module || process.argv[1]?.endsWith("setup-mfa-schema.ts")) {
  setupMfaSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[SCHEMA ERROR]:", err);
      process.exit(1);
    });
}
