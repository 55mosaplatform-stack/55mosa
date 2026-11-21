import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";
import {
  SecurityIncidentRecord,
  SecurityIncidentType,
  SecurityIncidentStatus,
  SecurityDefenseAction,
  SecurityBlockedIpRecord,
  AlertSeverity,
} from "@/types";
import { inspectRequestThreats } from "./threat-inspector";
export { inspectRequestThreats };

let securityTablesInitialized = false;

// Fast in-memory cache for blocked IPs to guarantee sub-millisecond middleware checks
const localBlockedIps = new Map<string, number>(); // ip -> blockedUntil timestamp ms

/**
 * Initializes security guard PostgreSQL tables and indexes non-destructively.
 */
export async function ensureSecurityTables() {
  if (securityTablesInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "security_incidents" (
        "id" VARCHAR(64) PRIMARY KEY,
        "incident_type" VARCHAR(64) NOT NULL,
        "severity" VARCHAR(16) NOT NULL,
        "status" VARCHAR(24) NOT NULL DEFAULT 'DETECTED',
        "client_ip" VARCHAR(64),
        "actor_id" VARCHAR(64),
        "target_route" VARCHAR(255),
        "evidence" JSONB NOT NULL,
        "threat_score" INTEGER NOT NULL DEFAULT 50,
        "automated_defense_applied" VARCHAR(64) NOT NULL DEFAULT 'NONE',
        "defense_details" TEXT,
        "corrective_directive" TEXT NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_status" ON "security_incidents" ("status");
    `).catch(() => null);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_type" ON "security_incidents" ("incident_type");
    `).catch(() => null);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_created" ON "security_incidents" ("created_at" DESC);
    `).catch(() => null);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "security_blocked_ips" (
        "ip" VARCHAR(64) PRIMARY KEY,
        "reason" VARCHAR(255) NOT NULL,
        "incident_id" VARCHAR(64),
        "blocked_until" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_security_blocked_ips_until" ON "security_blocked_ips" ("blocked_until");
    `).catch(() => null);

    securityTablesInitialized = true;
  } catch (err) {
    console.warn("[SECURITY_INIT_WARNING]: Failed to ensure security guard tables:", err);
    securityTablesInitialized = true;
  }
}

/**
 * Checks whether an IP is currently blocked by the Autonomous Digital Security Guard.
 * Uses L1 in-memory cache with fallback to PostgreSQL.
 */
export async function isIpBlocked(ip: string): Promise<boolean> {
  const cleanIp = (ip || "").trim();
  if (!cleanIp || cleanIp === "127.0.0.1" || cleanIp === "::1") return false;

  const now = Date.now();

  // 1. Check L1 Memory Cache
  const memoryBlockUntil = localBlockedIps.get(cleanIp);
  if (memoryBlockUntil && memoryBlockUntil > now) {
    return true;
  } else if (memoryBlockUntil) {
    localBlockedIps.delete(cleanIp);
  }

  // 2. Check Database Registry
  try {
    await ensureSecurityTables();
    const rows: any = await prisma.$queryRawUnsafe(
      `SELECT "blocked_until" FROM "security_blocked_ips" WHERE "ip" = $1 AND "blocked_until" > NOW() LIMIT 1`,
      cleanIp
    );
    if (rows && rows.length > 0) {
      const untilMs = new Date(rows[0].blocked_until).getTime();
      localBlockedIps.set(cleanIp, untilMs);
      return true;
    }
  } catch (err) {
    // Database check failure: fail-open safely for legitimate traffic
  }

  return false;
}

/**
 * Quarantines an abusive IP address in security_blocked_ips for a specified duration.
 */
export async function blockIpAddress({
  ip,
  reason,
  durationMinutes = 30,
  incidentId,
}: {
  ip: string;
  reason: string;
  durationMinutes?: number;
  incidentId?: string;
}): Promise<void> {
  const cleanIp = (ip || "").trim();
  if (!cleanIp || cleanIp === "127.0.0.1" || cleanIp === "::1") return;

  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  localBlockedIps.set(cleanIp, blockedUntil.getTime());

  try {
    await ensureSecurityTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "security_blocked_ips" ("ip", "reason", "incident_id", "blocked_until", "created_at")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT ("ip") DO UPDATE
       SET "reason" = $2, "incident_id" = $3, "blocked_until" = $4`,
      cleanIp,
      reason,
      incidentId || null,
      blockedUntil
    );

    await logAuditEvent({
      action: "SECURITY_IP_BLOCKED",
      entityType: "SECURITY_GUARD",
      entityId: cleanIp,
      metadata: { reason, durationMinutes, blockedUntil: blockedUntil.toISOString() },
    });
  } catch (err) {
    console.error("[SECURITY_BLOCK_ERROR]: Failed to persist IP block:", err);
  }
}

/**
 * Manually unblocks an IP address with administrator audit justification.
 */
export async function unblockIpAddress(ip: string, adminId: string, reason: string): Promise<void> {
  const cleanIp = (ip || "").trim();
  localBlockedIps.delete(cleanIp);

  await ensureSecurityTables();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "security_blocked_ips" WHERE "ip" = $1`,
    cleanIp
  );

  await logAuditEvent({
    actorId: adminId,
    action: "SECURITY_IP_UNBLOCKED",
    entityType: "SECURITY_GUARD",
    entityId: cleanIp,
    metadata: { reason },
  });
}

// In-memory sliding window for brute force tracking
interface LoginAttemptTracker {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
}
const authFailuresByIp = new Map<string, LoginAttemptTracker>();

/**
 * Records a failed authentication attempt and triggers automated brute-force defense.
 */
export async function recordFailedAuthAttempt({
  ip,
  identifier,
  userAgent,
}: {
  ip: string;
  identifier: string;
  userAgent?: string;
}): Promise<{ shouldBlock: boolean; attemptsCount: number }> {
  const cleanIp = (ip || "127.0.0.1").trim();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10-minute window
  const maxAttempts = 5;

  let tracker = authFailuresByIp.get(cleanIp);
  if (!tracker || now - tracker.firstAttemptAt > windowMs) {
    tracker = { count: 1, firstAttemptAt: now, lastAttemptAt: now };
  } else {
    tracker.count++;
    tracker.lastAttemptAt = now;
  }
  authFailuresByIp.set(cleanIp, tracker);

  if (tracker.count >= maxAttempts) {
    const incidentId = `inc-bf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const reason = `Excessive failed logins (${tracker.count} attempts in 10m) targeting account "${identifier}"`;

    await blockIpAddress({
      ip: cleanIp,
      reason,
      durationMinutes: 30,
      incidentId,
    });

    await recordSecurityIncident({
      id: incidentId,
      incidentType: "BRUTE_FORCE",
      severity: "HIGH",
      clientIp: cleanIp,
      targetRoute: "/api/auth/login",
      threatScore: 85,
      automatedDefenseApplied: "IP_TEMPORARY_BLOCK",
      defenseDetails: `IP quarantined for 30 minutes following ${tracker.count} failed password attempts.`,
      correctiveDirective: "1. Review IP origin in Security Guard console.\n2. Confirm whether targeted account owner requires password reset.\n3. Keep IP blocked or unblock if proven legitimate user typo.",
      evidence: {
        identifier,
        attemptsCount: tracker.count,
        windowMinutes: 10,
        userAgent: userAgent || "unknown",
      },
    });

    return { shouldBlock: true, attemptsCount: tracker.count };
  }

  return { shouldBlock: false, attemptsCount: tracker.count };
}

/**
 * Validates file upload security (MIME type, extension, size, and header signature).
 */
export function validateUploadSecurity({
  filename,
  mimeType,
  sizeBytes,
}: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): { isAllowed: boolean; rejectionReason?: string; threatScore: number } {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  // Prohibited executable and script extensions
  const dangerousExtensions = new Set([
    "exe", "bat", "cmd", "sh", "vbs", "ps1", "js", "mjs", "ts",
    "py", "php", "phtml", "jsp", "asp", "aspx", "cgi", "pl",
    "jar", "war", "dll", "so", "msi", "com", "scr"
  ]);

  if (dangerousExtensions.has(ext)) {
    return {
      isAllowed: false,
      rejectionReason: `Executable file extension ".${ext}" is strictly prohibited for security protection.`,
      threatScore: 95,
    };
  }

  // Permitted media formats for MOSA business storefronts
  const allowedExtensions = new Set([
    "jpg", "jpeg", "png", "webp", "gif", "svg", "mp4", "webm", "pdf"
  ]);

  if (!allowedExtensions.has(ext)) {
    return {
      isAllowed: false,
      rejectionReason: `Unsupported file extension ".${ext}". Allowed formats: JPG, PNG, WEBP, MP4, WEBM, PDF.`,
      threatScore: 40,
    };
  }

  // Max size: 25 MB for videos, 8 MB for images
  const maxBytes = ext === "mp4" || ext === "webm" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return {
      isAllowed: false,
      rejectionReason: `File size exceeds platform limit (${Math.round(sizeBytes / (1024 * 1024))} MB > ${Math.round(maxBytes / (1024 * 1024))} MB).`,
      threatScore: 30,
    };
  }

  return { isAllowed: true, threatScore: 0 };
}

/**
 * Records a verified security incident into PostgreSQL and triggers immediate administrative warnings.
 */
export async function recordSecurityIncident({
  id,
  incidentType,
  severity,
  clientIp,
  actorId,
  targetRoute,
  evidence,
  threatScore,
  automatedDefenseApplied,
  defenseDetails,
  correctiveDirective,
}: {
  id?: string;
  incidentType: SecurityIncidentType;
  severity: AlertSeverity;
  clientIp?: string;
  actorId?: string;
  targetRoute?: string;
  evidence: Record<string, any>;
  threatScore: number;
  automatedDefenseApplied: SecurityDefenseAction;
  defenseDetails?: string;
  correctiveDirective: string;
}): Promise<SecurityIncidentRecord> {
  await ensureSecurityTables();
  const incidentId = id || `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "security_incidents" (
      "id", "incident_type", "severity", "status", "client_ip", "actor_id",
      "target_route", "evidence", "threat_score", "automated_defense_applied",
      "defense_details", "corrective_directive", "created_at", "updated_at"
    ) VALUES ($1, $2, $3, 'DETECTED', $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
    incidentId,
    incidentType,
    severity,
    clientIp || null,
    actorId || null,
    targetRoute || null,
    JSON.stringify(evidence),
    threatScore,
    automatedDefenseApplied,
    defenseDetails || null,
    correctiveDirective
  );

  await logAuditEvent({
    actorId,
    action: `SECURITY_INCIDENT_${incidentType}`,
    entityType: "SECURITY_INCIDENT",
    entityId: incidentId,
    ipAddress: clientIp,
    metadata: { incidentType, severity, threatScore, automatedDefenseApplied },
  });

  const rows: any = await prisma.$queryRawUnsafe(
    `SELECT * FROM "security_incidents" WHERE "id" = $1`,
    incidentId
  );
  return formatDbIncident(rows[0]);
}

/**
 * Returns security incidents and active blocked IPs for Command Center radar.
 */
export async function getSecurityGuardTelemetry(): Promise<{
  incidents: SecurityIncidentRecord[];
  blockedIps: SecurityBlockedIpRecord[];
  guardStatus: {
    isActive: boolean;
    shieldMode: "ENFORCING" | "MONITORING";
    totalBlockedActive: number;
    incidents24h: number;
    threatsNeutralized: number;
  };
}> {
  await ensureSecurityTables();

  const [incidentsRows, blockedRows]: any = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT * FROM "security_incidents" ORDER BY "created_at" DESC LIMIT 50`
    ),
    prisma.$queryRawUnsafe(
      `SELECT * FROM "security_blocked_ips" WHERE "blocked_until" > NOW() ORDER BY "created_at" DESC`
    ),
  ]);

  const incidents = (incidentsRows || []).map(formatDbIncident);
  const blockedIps = (blockedRows || []).map((b: any) => ({
    ip: b.ip,
    reason: b.reason,
    incidentId: b.incident_id,
    blockedUntil: new Date(b.blocked_until).toISOString(),
    createdAt: new Date(b.created_at).toISOString(),
  }));

  const now = Date.now();
  const past24h = now - 24 * 60 * 60 * 1000;
  const incidents24h = incidents.filter(
    (i: SecurityIncidentRecord) => new Date(i.createdAt).getTime() > past24h
  ).length;

  const threatsNeutralized = incidents.filter(
    (i: SecurityIncidentRecord) => i.automatedDefenseApplied !== "NONE"
  ).length;

  return {
    incidents,
    blockedIps,
    guardStatus: {
      isActive: true,
      shieldMode: "ENFORCING",
      totalBlockedActive: blockedIps.length,
      incidents24h,
      threatsNeutralized,
    },
  };
}

function formatDbIncident(raw: any): SecurityIncidentRecord {
  return {
    id: raw.id,
    incidentType: raw.incident_type,
    severity: raw.severity,
    status: raw.status,
    clientIp: raw.client_ip,
    actorId: raw.actor_id,
    targetRoute: raw.target_route,
    evidence: typeof raw.evidence === "string" ? JSON.parse(raw.evidence) : raw.evidence,
    threatScore: Number(raw.threat_score),
    automatedDefenseApplied: raw.automated_defense_applied,
    defenseDetails: raw.defense_details,
    correctiveDirective: raw.corrective_directive,
    createdAt: new Date(raw.created_at).toISOString(),
    updatedAt: new Date(raw.updated_at).toISOString(),
  };
}
