export type SupportedPushProvider = "MTN_MOMO" | "AIRTEL_MONEY";

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
