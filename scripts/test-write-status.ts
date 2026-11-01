import { prisma } from "../src/lib/prisma";

async function testWriteStatus() {
  try {
    const [readOnlySetting]: any = await prisma.$queryRawUnsafe(`
      SELECT current_setting('transaction_read_only') AS is_read_only;
    `);
    console.log("Current transaction_read_only setting:", readOnlySetting);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`CREATE TEMP TABLE _test_storage_write_probe (id int)`);
        await tx.$queryRawUnsafe(`INSERT INTO _test_storage_write_probe VALUES (1)`);
        await tx.$queryRawUnsafe(`DROP TABLE _test_storage_write_probe`);
      });
      console.log("Database write probe: SUCCESSFUL (Database accepted write commands)");
    } catch (writeErr: any) {
      console.log("Database write probe FAILED:", writeErr.message);
    }

  } catch (err: any) {
    console.error("Error testing write status:", err);
  } finally {
    await prisma.$disconnect();
  }
}

testWriteStatus();
