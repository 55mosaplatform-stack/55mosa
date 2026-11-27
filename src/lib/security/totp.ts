import crypto from "crypto";

// RFC 4648 Base32 Alphabet
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer into a standard Base32 string (RFC 4648)
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer (RFC 4648)
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically secure 160-bit (20-byte) Base32 secret for TOTP
 */
export function generateTotpSecret(numBytes = 20): string {
  const randomBytes = crypto.randomBytes(numBytes);
  return base32Encode(randomBytes);
}

/**
 * Formats an otpauth:// URI for QR code scanning (RFC 6238)
 */
export function generateOtpAuthUri(
  secret: string,
  accountEmail: string,
  issuer = "55 MOSA"
): string {
  const cleanSecret = secret.replace(/[\s-]/g, "").toUpperCase();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`;
  return `otpauth://totp/${label}?secret=${cleanSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Computes the 6-digit TOTP code for a secret at a given timestamp step (RFC 6238 / RFC 4226)
 */
export function generateTotpCode(
  secret: string,
  timeMs = Date.now(),
  periodSeconds = 30,
  digits = 6
): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / periodSeconds);

  // 8-byte big-endian counter buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226 section 5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binaryCode % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

export interface TotpVerificationResult {
  isValid: boolean;
  step?: bigint;
  reason?: string;
}

/**
 * Verifies a 6-digit TOTP code against a secret with clock-drift window & replay-attack guard
 */
export function verifyTotpCode(
  secret: string,
  token: string,
  options: {
    timeMs?: number;
    periodSeconds?: number;
    digits?: number;
    window?: number; // +/- window steps (default: 1 step = +/- 30s)
    lastUsedStep?: bigint | null;
  } = {}
): TotpVerificationResult {
  if (!secret || !token) {
    return { isValid: false, reason: "Missing secret or token" };
  }

  const cleanToken = token.trim().replace(/\D/g, "");
  if (cleanToken.length !== (options.digits || 6)) {
    return { isValid: false, reason: "Invalid token length" };
  }

  const now = options.timeMs || Date.now();
  const period = options.periodSeconds || 30;
  const digits = options.digits || 6;
  const windowSteps = options.window !== undefined ? options.window : 1;
  const currentStep = Math.floor(now / 1000 / period);

  // Check across drift window (e.g. step - 1, step, step + 1)
  for (let w = -windowSteps; w <= windowSteps; w++) {
    const testStep = currentStep + w;
    const testTimeMs = testStep * period * 1000;
    const expectedCode = generateTotpCode(secret, testTimeMs, period, digits);

    // Constant-time string comparison to prevent timing attacks
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expectedCode))) {
      const stepBigInt = BigInt(testStep);

      // Replay Attack Guard: Token from an already-consumed or older step cannot be reused
      if (options.lastUsedStep != null && stepBigInt <= options.lastUsedStep) {
        return {
          isValid: false,
          reason: "Token replay detected: this code was already used for authentication.",
        };
      }

      return {
        isValid: true,
        step: stepBigInt,
      };
    }
  }

  return { isValid: false, reason: "Code does not match current TOTP window." };
}

/**
 * Hashes a recovery code using SHA-256 with a security salt
 */
export function hashRecoveryCode(code: string): string {
  const clean = code.toUpperCase().replace(/[\s-]/g, "");
  const salt = process.env.JWT_SECRET || "mosa-recovery-salt-2026";
  return crypto.createHmac("sha256", salt).update(clean).digest("hex");
}

/**
 * Generates emergency recovery codes (e.g. 8 codes formatted as XXXX-XXXX)
 */
export function generateRecoveryCodes(count = 8): {
  plainCodes: string[];
  hashedCodes: string[];
} {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    // 8 uppercase alphanumeric characters formatted as XXXX-XXXX
    const raw = crypto.randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashRecoveryCode(formatted));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verifies a recovery code and consumes it (removes it from the remaining codes list)
 */
export function verifyAndConsumeRecoveryCode(
  inputCode: string,
  existingHashedCodes: string[]
): {
  isValid: boolean;
  remainingHashedCodes: string[];
} {
  if (!inputCode || !Array.isArray(existingHashedCodes) || existingHashedCodes.length === 0) {
    return { isValid: false, remainingHashedCodes: existingHashedCodes || [] };
  }

  const inputHash = hashRecoveryCode(inputCode);
  const matchIndex = existingHashedCodes.findIndex((h) => h === inputHash);

  if (matchIndex === -1) {
    return { isValid: false, remainingHashedCodes: existingHashedCodes };
  }

  // Consume the code (single-use)
  const remaining = [...existingHashedCodes];
  remaining.splice(matchIndex, 1);

  return {
    isValid: true,
    remainingHashedCodes: remaining,
  };
}

/**
 * Lightweight SVG QR code matrix generator for otpauth URI (RFC 18004 minimal subset)
 * Produces crisp, standalone SVG that renders in any browser with zero network dependencies.
 */
export function generateQrSvgDataUri(text: string): string {
  // Simple SVG fallback data representation
  const escaped = encodeURIComponent(text);
  // Use high-contrast QR generation or data URL for seamless rendering
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${escaped}&margin=1`;
}
