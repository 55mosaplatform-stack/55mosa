import crypto from "crypto";
import { prisma } from "../prisma";
import { normalizeRwandaPhone } from "./push-gateway";

export interface PaypackConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  environment: "development" | "production";
  cashoutDestinationPhone: string;
  autoCashoutEnabled: boolean;
  minCashoutThreshold: number;
}

export interface PaypackCashinResult {
  success: boolean;
  ref: string;
  status: "pending" | "successful" | "failed";
  amount: number;
  clientPhone: string;
  provider: "mtn" | "airtel";
  promptDispatched: boolean;
  isSimulation: boolean;
  message: string;
  rawResponse?: any;
}

export interface PaypackCashoutResult {
  success: boolean;
  ref: string;
  status: "pending" | "successful" | "failed";
  amount: number;
  destinationPhone: string;
  fee?: number;
  isSimulation: boolean;
  message: string;
  rawResponse?: any;
}

export interface PaypackWebhookPayload {
  event_id: string;
  kind: "transaction:processed" | "transaction:created" | string;
  created_at: string;
  data: {
    ref: string;
    kind: "CASHIN" | "CASHOUT";
    fee?: number;
    merchant?: string;
    client: string;
    amount: number;
    provider: "mtn" | "airtel";
    status: "successful" | "failed" | "pending";
    created_at: string;
    processed_at?: string;
  };
}

let cachedAuthToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns Paypack operational configuration from environment variables.
 */
export function getPaypackConfig(): PaypackConfig {
  return {
    baseUrl: process.env.PAYPACK_BASE_URL || "https://payments.paypack.rw/api",
    clientId: process.env.PAYPACK_CLIENT_ID || "",
    clientSecret: process.env.PAYPACK_CLIENT_SECRET || "",
    webhookSecret: process.env.PAYPACK_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "paypack_webhook_secret_mosa_2026",
    environment: (process.env.PAYPACK_ENVIRONMENT as "development" | "production") || "development",
    cashoutDestinationPhone: process.env.PAYPACK_CASHOUT_PHONE || "0729974065", // Default: Primary MOSA Airtel receiving number
    autoCashoutEnabled: process.env.PAYPACK_AUTO_CASHOUT === "true",
    minCashoutThreshold: Number(process.env.PAYPACK_MIN_CASHOUT_THRESHOLD || 5000),
  };
}

/**
 * Checks if Paypack is fully provisioned with merchant credentials.
 */
export function isPaypackConfigured(): {
  isConfigured: boolean;
  missingRequirements: string[];
} {
  const config = getPaypackConfig();
  const missing: string[] = [];

  if (!config.clientId) missing.push("PAYPACK_CLIENT_ID");
  if (!config.clientSecret) missing.push("PAYPACK_CLIENT_SECRET");

  return {
    isConfigured: missing.length === 0,
    missingRequirements: missing,
  };
}

/**
 * Obtains an authenticated Bearer token from Paypack via client credentials.
 * Automatically caches token until near expiry.
 */
export async function getPaypackAuthToken(): Promise<string> {
  const config = getPaypackConfig();
  const now = Date.now();

  if (cachedAuthToken && cachedAuthToken.expiresAt > now + 60000) {
    return cachedAuthToken.token;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Paypack credentials not configured. Please provide PAYPACK_CLIENT_ID and PAYPACK_CLIENT_SECRET.");
  }

  const res = await fetch(`${config.baseUrl}/auth/agents/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Paypack authorization error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const token = data.access || data.access_token || data.token;

  if (!token) {
    throw new Error("Paypack authorization succeeded but no access token was returned.");
  }

  // Paypack tokens typically expire in 2 hours; cache for 90 minutes
  cachedAuthToken = {
    token,
    expiresAt: now + 90 * 60 * 1000,
  };

  return token;
}

/**
 * Initiates an Urubuto-style Mobile Money collection (Cashin) via Paypack.
 * Operator network automatically pushes a PIN approval prompt to the customer's phone.
 */
export async function initiatePaypackCashin({
  paymentReference,
  amount,
  phoneNumber,
  description,
}: {
  paymentReference: string;
  amount: number;
  phoneNumber: string;
  description?: string;
}): Promise<PaypackCashinResult> {
  const config = getPaypackConfig();
  const isSimulationPermitted =
    process.env.ENABLE_PAYMENT_SIMULATOR === "true" ||
    process.env.ALLOW_STAGING_PAYMENT_SIMULATION === "true" ||
    process.env.NODE_ENV !== "production";

  // Normalize phone to Rwanda 10-digit local format: "07xxxxxxxx"
  const cleanPhone = phoneNumber.replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0");
  const isMtn = cleanPhone.startsWith("078") || cleanPhone.startsWith("079");
  const isAirtel = cleanPhone.startsWith("072") || cleanPhone.startsWith("073");

  if (!isMtn && !isAirtel) {
    throw new Error(`Phone number "${phoneNumber}" is not a recognized Rwandan MTN or Airtel Mobile Money number.`);
  }

  const providerType = isMtn ? "mtn" : "airtel";
  const { isConfigured, missingRequirements } = isPaypackConfigured();

  // 1. Live Provider Mode (When API credentials exist)
  if (isConfigured) {
    try {
      const token = await getPaypackAuthToken();
      const res = await fetch(`${config.baseUrl}/transactions/cashin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": paymentReference,
          "X-Webhook-Mode": config.environment,
        },
        body: JSON.stringify({
          amount: Math.round(amount),
          number: cleanPhone,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || `Paypack cashin returned HTTP ${res.status}`);
      }

      const txRef = data.ref || data.transaction_id || `PP-${Date.now()}`;
      return {
        success: true,
        ref: txRef,
        status: (data.status || "pending").toLowerCase() as any,
        amount,
        clientPhone: cleanPhone,
        provider: providerType,
        promptDispatched: true,
        isSimulation: false,
        message: `Payment approval prompt dispatched to ${cleanPhone}. Please enter your Mobile Money PIN on your phone.`,
        rawResponse: data,
      };
    } catch (err: any) {
      if (!isSimulationPermitted) {
        throw err;
      }
      console.warn(`[PAYPACK_LIVE_FALLBACK] Live call failed (${err.message}); falling back to sandbox simulator.`);
    }
  }

  // 2. Strict Production Guard (If in real production with missing keys)
  if (!isSimulationPermitted) {
    return {
      success: false,
      ref: "",
      status: "failed",
      amount,
      clientPhone: cleanPhone,
      provider: providerType,
      promptDispatched: false,
      isSimulation: false,
      message: `Paypack credentials unconfigured in production: ${missingRequirements.join(", ")}`,
    };
  }

  // 3. High-Fidelity Sandbox / Simulator Mode
  const simulatedRef = `PAYPACK-${Date.now().toString().slice(-6)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  return {
    success: true,
    ref: simulatedRef,
    status: "pending",
    amount,
    clientPhone: cleanPhone,
    provider: providerType,
    promptDispatched: true,
    isSimulation: true,
    message: `[SANDBOX] Urubuto-style PIN prompt simulated for ${cleanPhone} (${providerType.toUpperCase()}). Please enter your PIN on your phone.`,
    rawResponse: {
      simulated: true,
      ref: simulatedRef,
      status: "pending",
      amount,
      client: cleanPhone,
      provider: providerType,
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Initiates an automated Cashout (payout/settlement) from Paypack merchant balance
 * directly into MOSA's registered Airtel Money receiving SIM (0729974065).
 */
export async function initiatePaypackCashout({
  amount,
  destinationPhone,
  paymentReference,
}: {
  amount: number;
  destinationPhone?: string;
  paymentReference?: string;
}): Promise<PaypackCashoutResult> {
  const config = getPaypackConfig();
  const targetPhone = destinationPhone || config.cashoutDestinationPhone;
  const cleanPhone = targetPhone.replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0");

  const isSimulationPermitted =
    process.env.ENABLE_PAYMENT_SIMULATOR === "true" ||
    process.env.ALLOW_STAGING_PAYMENT_SIMULATION === "true" ||
    process.env.NODE_ENV !== "production";

  const { isConfigured, missingRequirements } = isPaypackConfigured();

  // 1. Live Provider Mode
  if (isConfigured) {
    try {
      const token = await getPaypackAuthToken();
      const idempotencyKey = paymentReference ? `cashout-${paymentReference}` : `cashout-${Date.now()}`;

      const res = await fetch(`${config.baseUrl}/transactions/cashout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
          "X-Webhook-Mode": config.environment,
        },
        body: JSON.stringify({
          amount: Math.round(amount),
          phone: cleanPhone,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || `Paypack cashout returned HTTP ${res.status}`);
      }

      const txRef = data.ref || data.transaction_id || `PP-OUT-${Date.now()}`;
      return {
        success: true,
        ref: txRef,
        status: (data.status || "pending").toLowerCase() as any,
        amount,
        destinationPhone: cleanPhone,
        fee: data.fee !== undefined ? Number(data.fee) : undefined,
        isSimulation: false,
        message: `Payout of ${amount} RWF to Airtel wallet ${cleanPhone} submitted successfully.`,
        rawResponse: data,
      };
    } catch (err: any) {
      if (!isSimulationPermitted) {
        throw err;
      }
      console.warn(`[PAYPACK_CASHOUT_FALLBACK] Live cashout failed (${err.message}); falling back to simulator.`);
    }
  }

  // 2. Strict Production Guard
  if (!isSimulationPermitted) {
    return {
      success: false,
      ref: "",
      status: "failed",
      amount,
      destinationPhone: cleanPhone,
      isSimulation: false,
      message: `Cannot execute cashout: Paypack credentials missing (${missingRequirements.join(", ")})`,
    };
  }

  // 3. High-Fidelity Simulator
  const simulatedOutRef = `PAYPACK-OUT-${Date.now().toString().slice(-6)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  return {
    success: true,
    ref: simulatedOutRef,
    status: "successful",
    amount,
    destinationPhone: cleanPhone,
    fee: Math.round(amount * 0.012),
    isSimulation: true,
    message: `[SANDBOX] Payout of ${amount} RWF to ${cleanPhone} simulated successfully.`,
    rawResponse: {
      simulated: true,
      ref: simulatedOutRef,
      status: "successful",
      amount,
      phone: cleanPhone,
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Validates the HMAC-SHA256 cryptographic webhook signature from Paypack.
 * Paypack sends the signature in header `x-paypack-signature`.
 */
export function verifyPaypackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string
): boolean {
  if (!rawBody || !signatureHeader) return false;

  const webhookSecret = secret || getPaypackConfig().webhookSecret;
  if (!webhookSecret) return false;

  try {
    // 1. Paypack official documentation: HMAC-SHA256 converted to base64
    const computedBase64 = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("base64");

    if (timingSafeEqualString(computedBase64, signatureHeader.trim())) {
      return true;
    }

    // 2. Fallback check: HMAC-SHA256 in hex format (common developer wrapper variant)
    const computedHex = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    return timingSafeEqualString(computedHex, signatureHeader.trim());
  } catch {
    return false;
  }
}

/**
 * Constant-time safe string comparator to protect against timing attacks.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

/**
 * Parses and verifies a Paypack webhook event structure.
 */
export function parsePaypackWebhookPayload(payload: any): {
  isValid: boolean;
  ref?: string;
  kind?: "CASHIN" | "CASHOUT";
  amount?: number;
  status?: "successful" | "failed" | "pending";
  clientPhone?: string;
  provider?: "MTN_MOMO" | "AIRTEL_MONEY";
  error?: string;
} {
  if (!payload || typeof payload !== "object") {
    return { isValid: false, error: "Empty or invalid JSON payload." };
  }

  const data = payload.data || payload;
  const ref = data.ref || data.transaction_id || data.id;
  const status = (data.status || "").toLowerCase();
  const kind = (data.kind || "CASHIN").toUpperCase() as "CASHIN" | "CASHOUT";
  const amount = Number(data.amount);

  if (!ref) {
    return { isValid: false, error: "Payload missing transaction reference ('ref')." };
  }

  const rawProvider = (data.provider || "").toLowerCase();
  const provider = rawProvider === "airtel" ? "AIRTEL_MONEY" : "MTN_MOMO";

  return {
    isValid: true,
    ref,
    kind,
    amount,
    status: status === "successful" ? "successful" : status === "failed" ? "failed" : "pending",
    clientPhone: data.client || data.number || data.phone,
    provider,
  };
}

/**
 * Queries Paypack API to verify transaction status.
 */
export async function queryPaypackTransaction(ref: string): Promise<{
  found: boolean;
  status: "successful" | "failed" | "pending" | "not_found";
  amount?: number;
  client?: string;
  provider?: string;
  rawResponse?: any;
}> {
  const config = getPaypackConfig();
  const { isConfigured } = isPaypackConfigured();

  if (isConfigured) {
    try {
      const token = await getPaypackAuthToken();
      const res = await fetch(`${config.baseUrl}/transactions/find/${ref}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 404) return { found: false, status: "not_found" };
        throw new Error(`Paypack transaction lookup failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const status = (data.status || "pending").toLowerCase();
      return {
        found: true,
        status: status === "successful" ? "successful" : status === "failed" ? "failed" : "pending",
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        client: data.client,
        provider: data.provider,
        rawResponse: data,
      };
    } catch (err: any) {
      console.warn(`[PAYPACK_STATUS_QUERY_ERROR] Failed to query ${ref}:`, err.message);
    }
  }

  // Check database if ref was recorded in simulated transactions
  const dbPayment = await prisma.registrationPayment.findFirst({
    where: {
      OR: [
        { providerTransactionRef: ref },
        { paymentReference: ref },
      ],
    },
  });

  if (!dbPayment) {
    return { found: false, status: "not_found" };
  }

  const statusMap: Record<string, "successful" | "failed" | "pending"> = {
    CONFIRMED: "successful",
    FAILED: "failed",
    CANCELLED: "failed",
    EXPIRED: "failed",
    PENDING: "pending",
    WAITING_FOR_CUSTOMER_APPROVAL: "pending",
  };

  return {
    found: true,
    status: statusMap[dbPayment.status] || "pending",
    amount: dbPayment.feeAmount,
    client: dbPayment.phoneNumber || undefined,
    provider: dbPayment.provider,
  };
}
