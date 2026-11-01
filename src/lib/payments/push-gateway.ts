import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { confirmPaymentAndActivateBusiness } from "./engine";

export type SupportedPushProvider = "MTN_MOMO" | "AIRTEL_MONEY";
export type PushPaymentStatus =
  | "PENDING"
  | "WAITING_FOR_CUSTOMER_APPROVAL"
  | "PROCESSING"
  | "EVIDENCE_RECEIVED"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "RECONCILIATION_REQUIRED";

export type PayerPaymentMethod = "AIRTEL_MONEY" | "MTN_MOMO" | "EKASH" | "BANK_TRANSFER";
export type CollectionRouteType = "ON_NET" | "EKASH_CROSS_NETWORK" | "BANK_TRANSFER";

export interface PaymentRouteInfo {
  payerMethod: PayerPaymentMethod;
  destinationProvider: string;
  destinationAccount: string;
  destinationAccountName: string;
  routeType: CollectionRouteType;
  ussdDialString: string;
  ussdDialUrl: string;
  instructionsEn: string;
  instructionsRw: string;
  isEkash: boolean;
  supportsDirectPush: boolean;
}

export interface PushPaymentRequestParams {
  paymentReference: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  provider: SupportedPushProvider;
  description?: string;
  businessName?: string;
  preferredDestination?: string;
}

export interface PushPaymentRequestResult {
  success: boolean;
  providerRequestId: string;
  status: PushPaymentStatus;
  promptDispatched: boolean;
  isSimulation: boolean;
  message: string;
  missingRequirements?: string[];
  routeInfo?: PaymentRouteInfo;
  rawResponse?: any;
}

export interface CarrierDetectionResult {
  isValid: boolean;
  normalizedPhone: string;
  detectedCarrier: SupportedPushProvider | "UNKNOWN";
  matchesSelectedProvider: boolean;
  warning?: string;
  isEkashEligible?: boolean;
  ekashNotice?: string;
}

/**
 * Normalizes Rwandan phone numbers to E.164 standard (+2507XXXXXXXX).
 */
export function normalizeRwandaPhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");

  if (cleaned.startsWith("250") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("07") && cleaned.length === 10) {
    return `+250${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith("7") && cleaned.length === 9) {
    return `+250${cleaned}`;
  }
  if (raw.startsWith("+250") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return raw.trim();
}

/**
 * Validates and identifies telecom carrier from Rwandan mobile phone number.
 * MTN Rwanda prefixes: 078, 079 (+25078, +25079)
 * Airtel Rwanda prefixes: 072, 073 (+25072, +25073)
 */
export function detectCarrierAndValidate(
  phone: string,
  selectedProvider?: SupportedPushProvider | "EKASH" | "BANK_TRANSFER"
): CarrierDetectionResult {
  const normalized = normalizeRwandaPhone(phone);
  const digits = normalized.replace(/\D/g, "");

  let detectedCarrier: SupportedPushProvider | "UNKNOWN" = "UNKNOWN";

  if (digits.startsWith("25078") || digits.startsWith("25079")) {
    detectedCarrier = "MTN_MOMO";
  } else if (digits.startsWith("25072") || digits.startsWith("25073")) {
    detectedCarrier = "AIRTEL_MONEY";
  }

  const isValidFormat = digits.startsWith("2507") && digits.length === 12 && detectedCarrier !== "UNKNOWN";

  let matchesSelected = true;
  let warning: string | undefined;
  let isEkashEligible = false;
  let ekashNotice: string | undefined;

  if (detectedCarrier === "UNKNOWN") {
    warning = "Unknown carrier prefix. Mobile Money push prompts require an active MTN (078/079) or Airtel (072/073) number.";
    if (selectedProvider) matchesSelected = false;
  } else if (selectedProvider === "EKASH") {
    matchesSelected = true;
    isEkashEligible = true;
    ekashNotice =
      detectedCarrier === "MTN_MOMO"
        ? "MTN MoMo payer paying via eKash national cross-network transfer to MOSA's Airtel collection wallet."
        : "Airtel Money payer paying via eKash national cross-network transfer.";
  } else if (selectedProvider && selectedProvider !== "BANK_TRANSFER" && selectedProvider !== detectedCarrier) {
    matchesSelected = false;
    isEkashEligible = true;
    const carrierName = detectedCarrier === "MTN_MOMO" ? "MTN MoMo" : "Airtel Money";
    const selectedName = selectedProvider === "MTN_MOMO" ? "MTN MoMo" : "Airtel Money";
    warning = `Phone number belongs to ${carrierName}, but ${selectedName} is selected. Please switch provider to ensure phone prompt delivery.`;
    ekashNotice = `Cross-network eKash interoperability is supported: ${carrierName} can pay directly to ${selectedName}.`;
  }

  return {
    isValid: isValidFormat,
    normalizedPhone: normalized,
    detectedCarrier,
    matchesSelectedProvider: matchesSelected,
    warning,
    isEkashEligible,
    ekashNotice,
  };
}

/**
 * Resolves the precise payment route between payer source method and MOSA collection destination.
 * Computes exact USSD strings (*182*1*1*... for Airtel on-net, *182*1*2*... for eKash cross-network),
 * 1-tap dialable URI links, and bilingual instructions.
 */
export async function resolvePaymentRoute({
  payerMethod,
  payerPhone,
  amount,
  preferredDestination,
}: {
  payerMethod: PayerPaymentMethod;
  payerPhone?: string;
  amount: number;
  preferredDestination?: string;
}): Promise<PaymentRouteInfo> {
  let airtelConfig = await prisma.paymentProviderConfig.findUnique({ where: { provider: "AIRTEL_MONEY" } });
  let mtnConfig = await prisma.paymentProviderConfig.findUnique({ where: { provider: "MTN_MOMO" } });
  let bankConfig = await prisma.paymentProviderConfig.findUnique({ where: { provider: "BANK_TRANSFER" } });

  const airtelNumber = airtelConfig?.accountNumber || "0729974065";
  const airtelName = airtelConfig?.accountName || "MOSA Network (Rwanda) Ltd";

  const mtnAccount = mtnConfig?.accountNumber || "0788123456";
  const mtnName = mtnConfig?.accountName || "MOSA Network (Rwanda) Ltd";

  const cleanAirtelNumber = airtelNumber.replace(/\D/g, "").replace(/^250/, "0");
  const cleanMtnNumber = mtnAccount.replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0");

  if (payerMethod === "BANK_TRANSFER") {
    return {
      payerMethod: "BANK_TRANSFER",
      destinationProvider: "BANK_TRANSFER",
      destinationAccount: bankConfig?.accountNumber || "00040-06912345-67 (BK) / 1000-45678-90 (I&M)",
      destinationAccountName: bankConfig?.accountName || "MOSA Network (Rwanda) Ltd",
      routeType: "BANK_TRANSFER",
      ussdDialString: "",
      ussdDialUrl: "",
      instructionsEn: "Transfer via Bank of Kigali (00040-06912345-67) or I&M Bank (1000-45678-90). Include invoice reference in narration.",
      instructionsRw: "Koresha Bank of Kigali (00040-06912345-67) cyangwa I&M Bank (1000-45678-90). Shyiramo reference muri narration.",
      isEkash: false,
      supportsDirectPush: false,
    };
  }

  // Primary MOSA collection destination is Airtel Money 0729974065 unless MTN is configured and requested
  const destProvider = preferredDestination === "MTN_MOMO" && mtnConfig?.isEnabled ? "MTN_MOMO" : "AIRTEL_MONEY";
  const destAccount = destProvider === "AIRTEL_MONEY" ? cleanAirtelNumber : cleanMtnNumber;
  const destName = destProvider === "AIRTEL_MONEY" ? airtelName : mtnName;

  const actualPayerMethod: SupportedPushProvider =
    payerMethod === "EKASH"
      ? (payerPhone?.includes("78") || payerPhone?.includes("79") ? "MTN_MOMO" : "AIRTEL_MONEY")
      : (payerMethod as SupportedPushProvider);

  const isOnNet = actualPayerMethod === destProvider;
  const isEkash = !isOnNet;

  let ussdDialString = "";
  let ussdDialUrl = "";
  let instructionsEn = "";
  let instructionsRw = "";

  if (actualPayerMethod === "AIRTEL_MONEY") {
    if (isOnNet) {
      // Airtel to Airtel On-Net
      ussdDialString = `*182*1*1*${destAccount}*${amount}#`;
      ussdDialUrl = `tel:*182*1*1*${destAccount}*${amount}%23`;
      instructionsEn = `From Airtel: Dial ${ussdDialString} and enter your Airtel Money PIN.`;
      instructionsRw = `Kuri Airtel: Kanda ${ussdDialString} ushyiremo umubare w'ibanga (PIN).`;
    } else {
      // Airtel to MTN Cross-Net
      ussdDialString = `*182*1*2*${destAccount}*${amount}#`;
      ussdDialUrl = `tel:*182*1*2*${destAccount}*${amount}%23`;
      instructionsEn = `From Airtel (eKash to MTN): Dial ${ussdDialString} and enter your Airtel Money PIN.`;
      instructionsRw = `Kuri Airtel (eKash kuri MTN): Kanda ${ussdDialString} ushyiremo umubare w'ibanga (PIN).`;
    }
  } else {
    // MTN Payer
    if (destProvider === "AIRTEL_MONEY") {
      // MTN to Airtel via eKash Interoperability
      ussdDialString = `*182*1*2*${destAccount}*${amount}#`;
      ussdDialUrl = `tel:*182*1*2*${destAccount}*${amount}%23`;
      instructionsEn = `From MTN (eKash to Airtel): Dial ${ussdDialString} or dial *182*1*2#, enter ${destAccount}, enter ${amount} RWF, and enter your MoMo PIN.`;
      instructionsRw = `Kuri MTN (eKash kuri Airtel): Kanda ${ussdDialString} cyangwa kanda *182*1*2#, shyiramo ${destAccount}, shyiramo ${amount} RWF, hanyuma ushyiremo PIN.`;
    } else {
      // MTN to MTN MoMoPay
      const isMerchantCode = destAccount.includes("*") || destAccount.length <= 8;
      if (isMerchantCode) {
        const codeOnly = destAccount.replace(/\D/g, "");
        ussdDialString = `*182*8*1*${codeOnly}*${amount}#`;
        ussdDialUrl = `tel:*182*8*1*${codeOnly}*${amount}%23`;
        instructionsEn = `From MTN MoMoPay: Dial ${ussdDialString} and enter your MoMo PIN.`;
        instructionsRw = `Kuri MTN MoMoPay: Kanda ${ussdDialString} ushyiremo PIN yawe.`;
      } else {
        ussdDialString = `*182*1*1*${destAccount}*${amount}#`;
        ussdDialUrl = `tel:*182*1*1*${destAccount}*${amount}%23`;
        instructionsEn = `From MTN: Dial ${ussdDialString} and enter your MoMo PIN.`;
        instructionsRw = `Kuri MTN: Kanda ${ussdDialString} ushyiremo PIN yawe.`;
      }
    }
  }

  const credStatus = getProviderCredentialStatus(actualPayerMethod);
  const supportsDirectPush = credStatus.isConfigured && isOnNet;

  return {
    payerMethod: actualPayerMethod,
    destinationProvider: destProvider,
    destinationAccount: destAccount,
    destinationAccountName: destName,
    routeType: isEkash ? "EKASH_CROSS_NETWORK" : "ON_NET",
    ussdDialString,
    ussdDialUrl,
    instructionsEn,
    instructionsRw,
    isEkash,
    supportsDirectPush,
  };
}

/**
 * Checks which merchant API credentials are configured in the environment.
 */
export function getProviderCredentialStatus(provider: SupportedPushProvider): {
  isConfigured: boolean;
  missingRequirements: string[];
} {
  const missing: string[] = [];

  if (provider === "MTN_MOMO") {
    if (!process.env.MTN_MOMO_SUBSCRIPTION_KEY) missing.push("MTN_MOMO_SUBSCRIPTION_KEY (Ocp-Apim-Subscription-Key)");
    if (!process.env.MTN_MOMO_API_USER) missing.push("MTN_MOMO_API_USER (X-Reference-Id UUID)");
    if (!process.env.MTN_MOMO_API_KEY) missing.push("MTN_MOMO_API_KEY (Merchant API Key)");
    return {
      isConfigured: missing.length === 0,
      missingRequirements: missing,
    };
  }

  if (provider === "AIRTEL_MONEY") {
    if (!process.env.AIRTEL_MONEY_CLIENT_ID) missing.push("AIRTEL_MONEY_CLIENT_ID");
    if (!process.env.AIRTEL_MONEY_CLIENT_SECRET) missing.push("AIRTEL_MONEY_CLIENT_SECRET");
    return {
      isConfigured: missing.length === 0,
      missingRequirements: missing,
    };
  }

  return { isConfigured: false, missingRequirements: ["Unknown provider"] };
}

/**
 * Initiates an UrubutoPay-style push payment request to customer's mobile wallet.
 * Supports direct carrier API gateway when live keys are provided, and
 * provider-compliant sandbox simulator when in development, test, or bridge simulation mode.
 */
export async function requestMobileMoneyPayment({
  paymentReference,
  amount,
  currency,
  phoneNumber,
  provider,
  description = "55 MOSA Business Registration Fee",
  businessName = "Business",
  preferredDestination,
}: PushPaymentRequestParams): Promise<PushPaymentRequestResult> {
  // 1. Validation
  if (currency.toUpperCase() !== "RWF") {
    throw new Error(`Invalid currency "${currency}". Only RWF payments are supported.`);
  }

  const carrierCheck = detectCarrierAndValidate(phoneNumber, provider);
  if (!carrierCheck.isValid) {
    throw new Error(`Invalid Rwandan mobile number: "${phoneNumber}". Expected format: +250 7X XXX XXXX.`);
  }

  // Resolve exact routing (on-net vs eKash cross-network)
  const routeInfo = await resolvePaymentRoute({
    payerMethod: provider,
    payerPhone: carrierCheck.normalizedPhone,
    amount,
    preferredDestination,
  });

  // 2. Locate or create payment record
  let payment = await prisma.registrationPayment.findUnique({
    where: { paymentReference },
  });

  if (!payment) {
    throw new Error(`Payment record with reference "${paymentReference}" was not found.`);
  }

  // If already confirmed, return idempotently
  if (payment.status === "CONFIRMED") {
    return {
      success: true,
      providerRequestId: payment.providerTransactionRef || payment.paymentReference,
      status: "CONFIRMED",
      promptDispatched: false,
      isSimulation: false,
      message: "Payment is already confirmed and active.",
      routeInfo,
    };
  }

  const credStatus = getProviderCredentialStatus(provider);
  const isDev = process.env.NODE_ENV !== "production";
  const stagingSimulatorPermitted =
    process.env.ALLOW_STAGING_PAYMENT_SIMULATION === "true" ||
    process.env.ENABLE_PAYMENT_SIMULATOR === "true";
  const isDevOrTest = isDev || stagingSimulatorPermitted;

  // If credentials missing in strict production, report missing requirements honestly
  if (!credStatus.isConfigured && (!isDevOrTest || (process.env.NODE_ENV === "production" && !stagingSimulatorPermitted))) {
    return {
      success: false,
      providerRequestId: "",
      status: "FAILED",
      promptDispatched: false,
      isSimulation: false,
      message: `Carrier merchant push API is not yet provisioned for ${provider}. Use direct USSD dial ${routeInfo.ussdDialString} on your phone to complete payment.`,
      missingRequirements: credStatus.missingRequirements,
      routeInfo,
    };
  }

  // 3. Dispatch genuine carrier API request if live keys configured
  if (credStatus.isConfigured) {
    try {
      if (provider === "MTN_MOMO") {
        const liveResult = await executeMtnMoMoRequestToPay({
          paymentReference,
          amount,
          currency,
          phoneNumber: carrierCheck.normalizedPhone,
          description,
        });
        return { ...liveResult, routeInfo };
      } else {
        const liveResult = await executeAirtelMoneyPushPayment({
          paymentReference,
          amount,
          currency,
          phoneNumber: carrierCheck.normalizedPhone,
          description,
        });
        return { ...liveResult, routeInfo };
      }
    } catch (err: any) {
      console.error(`[CARRIER_PUSH_ERROR] Failed to send ${provider} push:`, err);
      return {
        success: false,
        providerRequestId: "",
        status: "FAILED",
        promptDispatched: false,
        isSimulation: false,
        message: `Carrier API rejected payment request: ${err.message}`,
        routeInfo,
      };
    }
  }

  // 4. Provider Sandbox / Simulator Mode (for end-to-end testing & demo)
  const simulatedRequestId = `${provider === "MTN_MOMO" ? "MTN-REQ" : "AIRTEL-TXN"}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

  // Update payment record with providerRequestId, phone, routeInfo, and WAITING_FOR_CUSTOMER_APPROVAL status
  await prisma.registrationPayment.update({
    where: { id: payment.id },
    data: {
      provider,
      phoneNumber: carrierCheck.normalizedPhone,
      providerTransactionRef: simulatedRequestId,
      status: "WAITING_FOR_CUSTOMER_APPROVAL",
      failureReason: null,
      rawCallbackPayload: JSON.stringify({
        simulated: true,
        dispatchedAt: new Date().toISOString(),
        phoneNumber: carrierCheck.normalizedPhone,
        providerRequestId: simulatedRequestId,
        routeInfo,
      }),
    },
  });

  return {
    success: true,
    providerRequestId: simulatedRequestId,
    status: "WAITING_FOR_CUSTOMER_APPROVAL",
    promptDispatched: true,
    isSimulation: true,
    message: `Payment request of ${amount.toLocaleString()} RWF dispatched to ${carrierCheck.normalizedPhone}. Please check your phone and enter your Mobile Money PIN.`,
    routeInfo,
  };
}

/**
 * Genuine MTN MoMo Open API Collections (RequestToPay) Client.
 */
async function executeMtnMoMoRequestToPay({
  paymentReference,
  amount,
  currency,
  phoneNumber,
  description,
}: {
  paymentReference: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  description: string;
}): Promise<PushPaymentRequestResult> {
  const baseUrl = process.env.MTN_MOMO_BASE_URL || "https://proxy.momoapi.mtn.com";
  const subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
  const apiUser = process.env.MTN_MOMO_API_USER!;
  const apiKey = process.env.MTN_MOMO_API_KEY!;
  const targetEnv = process.env.MTN_MOMO_TARGET_ENV || "mtnrwanda";

  // Step 1: Obtain OAuth Bearer Token
  const basicAuth = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`MTN OAuth token error (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Step 2: Dispatch Request to Pay
  const requestReferenceId = crypto.randomUUID();
  const msisdn = phoneNumber.replace(/\D/g, "");

  const pushRes = await fetch(`${baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Reference-Id": requestReferenceId,
      "X-Target-Environment": targetEnv,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(amount),
      currency,
      externalId: paymentReference,
      payer: {
        partyIdType: "MSISDN",
        partyId: msisdn,
      },
      payerMessage: `55 MOSA: ${description}`,
      payeeNote: `Payment Ref: ${paymentReference}`,
    }),
  });

  if (pushRes.status !== 202) {
    const errText = await pushRes.text();
    throw new Error(`MTN RequestToPay failed (${pushRes.status}): ${errText}`);
  }

  // Update payment with MTN transaction UUID
  await prisma.registrationPayment.update({
    where: { paymentReference },
    data: {
      provider: "MTN_MOMO",
      phoneNumber,
      providerTransactionRef: requestReferenceId,
      status: "PENDING",
      rawCallbackPayload: JSON.stringify({
        mtnReferenceId: requestReferenceId,
        dispatchedAt: new Date().toISOString(),
      }),
    },
  });

  return {
    success: true,
    providerRequestId: requestReferenceId,
    status: "PENDING",
    promptDispatched: true,
    isSimulation: false,
    message: `Payment request dispatched to ${phoneNumber} via MTN MoMo. Please approve on your phone.`,
  };
}

/**
 * Genuine Airtel Money Merchant Open API (Collections / Push) Client.
 */
async function executeAirtelMoneyPushPayment({
  paymentReference,
  amount,
  currency,
  phoneNumber,
  description,
}: {
  paymentReference: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  description: string;
}): Promise<PushPaymentRequestResult> {
  const baseUrl = process.env.AIRTEL_MONEY_BASE_URL || "https://openapi.airtel.africa";
  const clientId = process.env.AIRTEL_MONEY_CLIENT_ID!;
  const clientSecret = process.env.AIRTEL_MONEY_CLIENT_SECRET!;

  // Step 1: Obtain OAuth Bearer Token
  const tokenRes = await fetch(`${baseUrl}/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Airtel OAuth token error (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Step 2: Dispatch Push Payment
  const localMsisdn = phoneNumber.replace(/^\+?250/, "");
  const transactionId = `AIRTEL-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const pushRes = await fetch(`${baseUrl}/merchant/v1/payments/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Country": "RW",
      "X-Currency": currency,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference: paymentReference,
      subscriber: {
        country: "RW",
        currency,
        msisdn: localMsisdn,
      },
      transaction: {
        amount,
        country: "RW",
        currency,
        id: transactionId,
      },
    }),
  });

  if (!pushRes.ok) {
    const errText = await pushRes.text();
    throw new Error(`Airtel Payment Request failed (${pushRes.status}): ${errText}`);
  }

  await prisma.registrationPayment.update({
    where: { paymentReference },
    data: {
      provider: "AIRTEL_MONEY",
      phoneNumber,
      providerTransactionRef: transactionId,
      status: "PENDING",
      rawCallbackPayload: JSON.stringify({
        airtelTransactionId: transactionId,
        dispatchedAt: new Date().toISOString(),
      }),
    },
  });

  return {
    success: true,
    providerRequestId: transactionId,
    status: "PENDING",
    promptDispatched: true,
    isSimulation: false,
    message: `Payment request dispatched to ${phoneNumber} via Airtel Money. Please enter your PIN on your phone.`,
  };
}

/**
 * Authoritative status query for MTN MoMo Collection RequestToPay.
 * GET /collection/v1_0/requesttopay/{referenceId}
 */
async function queryMtnMoMoPaymentStatus({
  referenceId,
  paymentReference,
  expectedAmount,
}: {
  referenceId: string;
  paymentReference: string;
  expectedAmount: number;
}): Promise<{
  settled: boolean;
  status: PushPaymentStatus;
  receipt?: any;
  payment?: any;
  failureReason?: string;
}> {
  const credStatus = getProviderCredentialStatus("MTN_MOMO");
  if (!credStatus.isConfigured) {
    return { settled: false, status: "PENDING" };
  }

  const baseUrl = process.env.MTN_MOMO_BASE_URL || "https://proxy.momoapi.mtn.com";
  const subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
  const apiUser = process.env.MTN_MOMO_API_USER!;
  const apiKey = process.env.MTN_MOMO_API_KEY!;
  const targetEnv = process.env.MTN_MOMO_TARGET_ENV || "mtnrwanda";

  try {
    const basicAuth = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
    const tokenRes = await fetch(`${baseUrl}/collection/token/`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!tokenRes.ok) {
      console.warn(`[MTN_POLL_TOKEN_ERROR] MTN OAuth token error (${tokenRes.status})`);
      return { settled: false, status: "PENDING" };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const statusRes = await fetch(`${baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!statusRes.ok) {
      console.warn(`[MTN_POLL_STATUS_ERROR] MTN RequestToPay query returned HTTP ${statusRes.status}`);
      return { settled: false, status: "PENDING" };
    }

    const data = await statusRes.json();
    const carrierStatus = (data.status || "").toUpperCase();

    if (carrierStatus === "SUCCESSFUL") {
      const currency = (data.currency || "").toUpperCase();
      const amountPaid = Number(data.amount);

      if (currency !== "RWF" || amountPaid < expectedAmount) {
        console.error(
          `[MTN_POLL_MISMATCH] Amount or currency mismatch: received ${amountPaid} ${currency}, expected ${expectedAmount} RWF`
        );
        return { settled: false, status: "PENDING" };
      }

      const txRef = data.financialTransactionId || referenceId;
      const confirmResult = await confirmPaymentAndActivateBusiness({
        paymentReference,
        providerTransactionRef: String(txRef),
        provider: "MTN_MOMO",
        amountPaid,
        currency: "RWF",
        verifiedBy: "MTN_MOMO_API_POLL",
        rawPayload: JSON.stringify(data),
      });

      return {
        settled: true,
        status: "CONFIRMED",
        receipt: confirmResult.receipt,
        payment: confirmResult.payment,
      };
    }

    if (carrierStatus === "FAILED") {
      const reason = data.reason || "Payment was rejected or expired on customer phone.";
      await prisma.registrationPayment.update({
        where: { paymentReference },
        data: {
          status: "FAILED",
          failureReason: reason,
          rawCallbackPayload: JSON.stringify(data),
        },
      });
      return {
        settled: false,
        status: "FAILED",
        failureReason: reason,
      };
    }

    return { settled: false, status: "PENDING" };
  } catch (err: any) {
    console.warn(`[MTN_POLL_TIMEOUT] Failed to poll MTN MoMo status (${err.message}). Keeping payment pending.`);
    return { settled: false, status: "PENDING" };
  }
}

/**
 * Authoritative status query for Airtel Money Open API payments.
 * GET /merchant/v1/payments/{transactionId}
 */
async function queryAirtelMoneyPaymentStatus({
  transactionId,
  paymentReference,
  expectedAmount,
}: {
  transactionId: string;
  paymentReference: string;
  expectedAmount: number;
}): Promise<{
  settled: boolean;
  status: PushPaymentStatus;
  receipt?: any;
  payment?: any;
  failureReason?: string;
}> {
  const credStatus = getProviderCredentialStatus("AIRTEL_MONEY");
  if (!credStatus.isConfigured) {
    return { settled: false, status: "PENDING" };
  }

  const baseUrl = process.env.AIRTEL_MONEY_BASE_URL || "https://openapi.airtel.africa";
  const clientId = process.env.AIRTEL_MONEY_CLIENT_ID!;
  const clientSecret = process.env.AIRTEL_MONEY_CLIENT_SECRET!;

  try {
    const tokenRes = await fetch(`${baseUrl}/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!tokenRes.ok) {
      console.warn(`[AIRTEL_POLL_TOKEN_ERROR] Airtel OAuth token error (${tokenRes.status})`);
      return { settled: false, status: "PENDING" };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const statusRes = await fetch(`${baseUrl}/merchant/v1/payments/${transactionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Country": "RW",
        "X-Currency": "RWF",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!statusRes.ok) {
      console.warn(`[AIRTEL_POLL_STATUS_ERROR] Airtel payment status query returned HTTP ${statusRes.status}`);
      return { settled: false, status: "PENDING" };
    }

    const data = await statusRes.json();
    const txStatus = data?.data?.transaction?.status; // "TS" (Success), "TF" (Failed), "TIP" (In Progress)

    if (txStatus === "TS") {
      const airtelId = data?.data?.transaction?.airtel_money_id || transactionId;
      const confirmResult = await confirmPaymentAndActivateBusiness({
        paymentReference,
        providerTransactionRef: String(airtelId),
        provider: "AIRTEL_MONEY",
        amountPaid: expectedAmount,
        currency: "RWF",
        verifiedBy: "AIRTEL_MONEY_API_POLL",
        rawPayload: JSON.stringify(data),
      });

      return {
        settled: true,
        status: "CONFIRMED",
        receipt: confirmResult.receipt,
        payment: confirmResult.payment,
      };
    }

    if (txStatus === "TF") {
      const reason = data?.data?.transaction?.message || "Airtel Money payment was declined or timed out.";
      await prisma.registrationPayment.update({
        where: { paymentReference },
        data: {
          status: "FAILED",
          failureReason: reason,
          rawCallbackPayload: JSON.stringify(data),
        },
      });
      return {
        settled: false,
        status: "FAILED",
        failureReason: reason,
      };
    }

    return { settled: false, status: "PENDING" };
  } catch (err: any) {
    console.warn(`[AIRTEL_POLL_TIMEOUT] Failed to poll Airtel Money status (${err.message}). Keeping payment pending.`);
    return { settled: false, status: "PENDING" };
  }
}

/**
 * Polls or verifies payment status against the provider gateway.
 * When payment is verified successful, atomically confirms business registration
 * and issues official receipt.
 */
export async function checkAndReconcilePaymentStatus(paymentReference: string): Promise<{
  status: PushPaymentStatus;
  payment: any;
  receipt?: any;
  isConfirmed: boolean;
  failureReason?: string | null;
}> {
  const payment = await prisma.registrationPayment.findUnique({
    where: { paymentReference },
    include: {
      receipt: true,
      business: true,
    },
  });

  if (!payment) {
    throw new Error(`Payment reference "${paymentReference}" not found.`);
  }

  if (payment.status === "CONFIRMED") {
    return {
      status: "CONFIRMED",
      payment,
      receipt: payment.receipt,
      isConfirmed: true,
    };
  }

  // If in active lifecycle waiting confirmation, reconcile against carrier if live keys are configured
  if (["PENDING", "WAITING_FOR_CUSTOMER_APPROVAL", "PROCESSING", "EVIDENCE_RECEIVED"].includes(payment.status)) {
    const credStatus = getProviderCredentialStatus(payment.provider as SupportedPushProvider);
    const isSimulated =
      payment.rawCallbackPayload?.includes('"simulated":true') ||
      !credStatus.isConfigured ||
      payment.providerTransactionRef?.startsWith("MTN-REQ-") ||
      payment.providerTransactionRef?.startsWith("AIRTEL-TXN-") ||
      payment.providerTransactionRef?.startsWith("TEST-");

    if (!isSimulated && credStatus.isConfigured && payment.providerTransactionRef) {
      if (payment.provider === "MTN_MOMO") {
        const pollResult = await queryMtnMoMoPaymentStatus({
          referenceId: payment.providerTransactionRef,
          paymentReference: payment.paymentReference,
          expectedAmount: payment.feeAmount,
        });
        if (pollResult.settled && pollResult.receipt) {
          return {
            status: "CONFIRMED",
            payment: pollResult.payment || payment,
            receipt: pollResult.receipt,
            isConfirmed: true,
          };
        }
        if (pollResult.status === "FAILED") {
          return {
            status: "FAILED",
            payment: { ...payment, status: "FAILED", failureReason: pollResult.failureReason },
            isConfirmed: false,
            failureReason: pollResult.failureReason,
          };
        }
      } else if (payment.provider === "AIRTEL_MONEY") {
        const pollResult = await queryAirtelMoneyPaymentStatus({
          transactionId: payment.providerTransactionRef,
          paymentReference: payment.paymentReference,
          expectedAmount: payment.feeAmount,
        });
        if (pollResult.settled && pollResult.receipt) {
          return {
            status: "CONFIRMED",
            payment: pollResult.payment || payment,
            receipt: pollResult.receipt,
            isConfirmed: true,
          };
        }
        if (pollResult.status === "FAILED") {
          return {
            status: "FAILED",
            payment: { ...payment, status: "FAILED", failureReason: pollResult.failureReason },
            isConfirmed: false,
            failureReason: pollResult.failureReason,
          };
        }
      }
    }

    // Check if payment has expired (e.g., pending for > 15 minutes)
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (ageMs > 15 * 60 * 1000) {
      const updated = await prisma.registrationPayment.update({
        where: { id: payment.id },
        data: {
          status: "EXPIRED",
          failureReason: "Payment request expired after 15 minutes without customer PIN confirmation.",
        },
        include: { receipt: true, business: true },
      });
      return {
        status: "EXPIRED",
        payment: updated,
        isConfirmed: false,
        failureReason: updated.failureReason,
      };
    }
  }

  return {
    status: payment.status as PushPaymentStatus,
    payment,
    receipt: payment.receipt,
    isConfirmed: payment.status === "CONFIRMED",
    failureReason: payment.failureReason,
  };
}

/**
 * Triggers simulated user interactions for tests & demo sandbox mode.
 */
export async function simulateSandboxCustomerAction({
  paymentReference,
  action, // "APPROVE" | "REJECT" | "TIMEOUT"
}: {
  paymentReference: string;
  action: "APPROVE" | "REJECT" | "TIMEOUT";
}) {
  const isProd = process.env.NODE_ENV === "production";
  const stagingSimulatorPermitted = process.env.ALLOW_STAGING_PAYMENT_SIMULATION === "true";

  if (isProd && !stagingSimulatorPermitted) {
    throw new Error("Payment action simulation is strictly forbidden in production.");
  }

  const payment = await prisma.registrationPayment.findUnique({
    where: { paymentReference },
    include: { business: true, receipt: true },
  });

  if (!payment) {
    throw new Error(`Payment "${paymentReference}" not found.`);
  }

  if (payment.provider === "BANK_TRANSFER") {
    throw new Error("Cannot simulate PIN actions for Bank Transfer payments.");
  }

  const isSimulatedTestPayment =
    process.env.ENABLE_PAYMENT_SIMULATOR === "true" ||
    process.env.ALLOW_STAGING_PAYMENT_SIMULATION === "true" ||
    payment.rawCallbackPayload?.includes('"simulated":true') ||
    payment.providerTransactionRef?.startsWith("MTN-REQ-") ||
    payment.providerTransactionRef?.startsWith("AIRTEL-TXN-") ||
    payment.providerTransactionRef?.startsWith("TEST-") ||
    payment.providerTransactionRef?.startsWith("SIM-") ||
    payment.paymentReference.includes("TEST") ||
    payment.paymentReference.includes("SIM") ||
    payment.paymentReference.includes("REJECT") ||
    payment.paymentReference.includes("TIMEOUT");

  if (!isSimulatedTestPayment) {
    throw new Error("Cannot simulate action on a real carrier payment. Simulation is restricted strictly to sandbox test payments.");
  }

  if (payment.status === "CONFIRMED") {
    return {
      success: true,
      alreadyConfirmed: true,
      payment,
      receipt: payment.receipt,
      businessId: payment.businessId,
      status: "CONFIRMED",
    };
  }

  if (action === "APPROVE") {
    const txRef = payment.providerTransactionRef || `${payment.provider}-TXN-${Date.now()}`;
    return await confirmPaymentAndActivateBusiness({
      paymentReference,
      providerTransactionRef: txRef,
      provider: payment.provider,
      amountPaid: payment.feeAmount,
      currency: "RWF",
      verifiedBy: `SANDBOX_SIMULATOR_${payment.provider}_TEST_ONLY`,
      rawPayload: JSON.stringify({
        simulatedApproval: true,
        action: "CUSTOMER_PIN_CONFIRMED",
        timestamp: new Date().toISOString(),
      }),
    });
  }

  if (action === "REJECT") {
    const updated = await prisma.registrationPayment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        failureReason: "Customer cancelled payment request on phone.",
        rawCallbackPayload: JSON.stringify({
          action: "CUSTOMER_REJECTED",
          timestamp: new Date().toISOString(),
        }),
      },
      include: { receipt: true, business: true },
    });
    return { success: true, payment: updated, status: "CANCELLED" };
  }

  if (action === "TIMEOUT") {
    const updated = await prisma.registrationPayment.update({
      where: { id: payment.id },
      data: {
        status: "EXPIRED",
        failureReason: "Payment request timed out without response from customer.",
        rawCallbackPayload: JSON.stringify({
          action: "EXPIRED_TIMEOUT",
          timestamp: new Date().toISOString(),
        }),
      },
      include: { receipt: true, business: true },
    });
    return { success: true, payment: updated, status: "EXPIRED" };
  }

  throw new Error(`Unknown simulation action "${action}".`);
}

