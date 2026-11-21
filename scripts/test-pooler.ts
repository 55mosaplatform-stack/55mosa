import { PrismaClient } from "@prisma/client";

const txPrisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.ghzmdjpymftjotlviiot:w%2Bn%23KsaW9yy6Q%21a@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
    },
  },
});

async function test() {
  console.log("Testing connection to port 6543 (transaction mode with pgbouncer=true)...");
  const count = await txPrisma.user.count();
  console.log("Transaction pooler port 6543 success! Total users:", count);
}

test()
  .catch(console.error)
  .finally(async () => {
    await txPrisma.$disconnect();
  });
