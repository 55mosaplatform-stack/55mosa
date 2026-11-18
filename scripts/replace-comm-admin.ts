import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting deletion and replacement of community administrator...");

  // 1. Find super admin
  let superAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "55mosaplatform@gmail.com" },
        { id: "user-super-admin" },
      ],
    },
  });

  if (!superAdmin) {
    console.error("Super admin user not found!");
    process.exit(1);
  }

  console.log(`Found Super Admin: id=${superAdmin.id}, email=${superAdmin.email}, role=${superAdmin.role}`);

  // Ensure super admin has community assigned
  await prisma.user.update({
    where: { id: superAdmin.id },
    data: {
      community: "Kigali Central & Nyamirambo Sector",
      assignedCell: "All Cells / National",
      name: "Super Administrator",
    },
  });
  console.log("Updated super admin community scope to national / Nyamirambo");

  // 2. Find community admin
  const commAdmins = await prisma.user.findMany({
    where: {
      OR: [
        { email: "admin@55mosa.com" },
        { id: "user-comm-admin" },
        { phone: "+250788000002" },
      ],
    },
    include: {
      sessions: true,
      auditLogs: true,
      businessesOwned: true,
      businessesAgent: true,
      notifications: true,
      reports: true,
    },
  });

  console.log(`Found ${commAdmins.length} matching community administrator records to remove/reassign.`);

  for (const commAdmin of commAdmins) {
    console.log(`Processing comm admin: id=${commAdmin.id}, email=${commAdmin.email}`);

    // Reassign businesses owned if any
    if (commAdmin.businessesOwned.length > 0) {
      await prisma.business.updateMany({
        where: { ownerId: commAdmin.id },
        data: { ownerId: superAdmin.id },
      });
      console.log(`Reassigned ${commAdmin.businessesOwned.length} owned businesses to super admin`);
    }

    // Reassign businesses agent if any
    if (commAdmin.businessesAgent.length > 0) {
      await prisma.business.updateMany({
        where: { agentId: commAdmin.id },
        data: { agentId: superAdmin.id },
      });
      console.log(`Reassigned ${commAdmin.businessesAgent.length} agent businesses to super admin`);
    }

    // Delete sessions
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId: commAdmin.id },
    });
    console.log(`Deleted ${deletedSessions.count} sessions`);

    // Delete notifications
    const deletedNotifs = await prisma.notification.deleteMany({
      where: { userId: commAdmin.id },
    });
    console.log(`Deleted ${deletedNotifs.count} notifications`);

    // Reassign audit logs to super admin
    const updatedAuditLogs = await prisma.auditLog.updateMany({
      where: { actorId: commAdmin.id },
      data: { actorId: superAdmin.id },
    });
    console.log(`Reassigned ${updatedAuditLogs.count} audit logs to super admin`);

    // Delete user
    await prisma.user.delete({
      where: { id: commAdmin.id },
    });
    console.log(`✓ Deleted community admin: ${commAdmin.email || commAdmin.id}`);
  }

  // Check remaining admins
  const remainingAdmins = await prisma.user.findMany({
    where: {
      role: { in: [Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR] },
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
    },
  });

  console.log("Remaining platform administrators in Supabase:", remainingAdmins);
}

main()
  .catch((e) => {
    console.error("Error replacing community administrator:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
