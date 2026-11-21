export type ThreatType = 
  | "SQLI_ATTEMPT" 
  | "XSS_ATTEMPT" 
  | "SUSPICIOUS_PAYLOAD" 
  | "PATH_TRAVERSAL";

export interface ThreatInspectionResult {
  isMalicious: boolean;
  threatType: ThreatType | null;
  matchedPattern: string | null;
  threatScore: number;
}

/**
 * Edge-compatible, pure regex threat detection algorithm.
 * Zero database or Node.js runtime dependencies. Guaranteed 100% safe in Next.js middleware.
 */
export function inspectRequestThreats(rawString: string): ThreatInspectionResult {
  if (!rawString || typeof rawString !== "string") {
    return { isMalicious: false, threatType: null, matchedPattern: null, threatScore: 0 };
  }

  // URL-decode if encoded
  let decoded = rawString;
  try {
    decoded = decodeURIComponent(rawString);
  } catch {
    // If malformed URI encoding, keep rawString
  }
  const lower = decoded.toLowerCase();

  // 1. SQL Injection Signatures
  const sqliPatterns = [
    /\bunion\s+(all\s+)?select\b/,
    /'\s+or\s+['"\d\w]+\s*=\s*['"\d\w]+/,
    /--\s*$/,
    /;\s*(drop|alter|truncate|delete)\s+table\b/,
    /\bexec(\s+|\()+xp_cmdshell\b/,
    /\bselect\s+.*\bfrom\s+information_schema\b/,
    /\bwaitfor\s+delay\s+'\d+:\d+:\d+'/,
  ];

  for (const pat of sqliPatterns) {
    if (pat.test(lower)) {
      return {
        isMalicious: true,
        threatType: "SQLI_ATTEMPT",
        matchedPattern: pat.toString(),
        threatScore: 90,
      };
    }
  }

  // 2. Cross-Site Scripting (XSS) Signatures
  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:\s*[^\s]+/i,
    /onerror\s*=\s*['"][^'"]+['"]/i,
    /onload\s*=\s*['"][^'"]+['"]/i,
    /<svg\s+onload/i,
    /<iframe[\s\S]*?>/i,
  ];

  for (const pat of xssPatterns) {
    if (pat.test(lower)) {
      return {
        isMalicious: true,
        threatType: "XSS_ATTEMPT",
        matchedPattern: pat.toString(),
        threatScore: 80,
      };
    }
  }

  // 3. Path Traversal Signatures
  const traversalPatterns = [
    /(\.\.\/|\.\.\\){2,}/,
    /%2e%2e%2f/i,
    /\/etc\/passwd/,
    /c:\\windows\\system32/i,
  ];

  for (const pat of traversalPatterns) {
    if (pat.test(lower)) {
      return {
        isMalicious: true,
        threatType: "PATH_TRAVERSAL",
        matchedPattern: pat.toString(),
        threatScore: 85,
      };
    }
  }

  return {
    isMalicious: false,
    threatType: null,
    matchedPattern: null,
    threatScore: 0,
  };
}
