import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "mosa-community-network-secure-jwt-secret-key-rwanda-2026"
);

const SESSION_COOKIE_NAME = "mosa_session";

// Standalone Edge-compatible regex threat scanner (Zero external file dependencies)
type EdgeThreatType = "SQLI_ATTEMPT" | "XSS_ATTEMPT" | "SUSPICIOUS_PAYLOAD" | "PATH_TRAVERSAL";

function inspectRequestThreats(rawString: string): { isMalicious: boolean; threatType: EdgeThreatType | null } {
  if (!rawString || typeof rawString !== "string") {
    return { isMalicious: false, threatType: null };
  }

  let decoded = rawString;
  try {
    decoded = decodeURIComponent(rawString);
  } catch {
    // Keep raw if invalid URI sequence
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
      return { isMalicious: true, threatType: "SQLI_ATTEMPT" };
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
      return { isMalicious: true, threatType: "XSS_ATTEMPT" };
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
      return { isMalicious: true, threatType: "PATH_TRAVERSAL" };
    }
  }

  return { isMalicious: false, threatType: null };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawUrl = request.url || "";
  const queryIndex = rawUrl.indexOf("?");
  const queryStr = queryIndex !== -1 ? rawUrl.slice(queryIndex) : (request.nextUrl.search || "");

  // 0. Digital Security Guard: Fast Edge Threat Scanner (Zero DB dependency)
  const targetToInspect = `${pathname} ${queryStr}`;
  const threat = inspectRequestThreats(targetToInspect);
  if (threat.isMalicious) {
    return NextResponse.json(
      {
        error: "Forbidden: Security violation pattern intercepted by 55 MOSA Shield.",
        threatType: threat.threatType,
      },
      { status: 403 }
    );
  }

  // Public admin auth and access routes that bypass middleware protection
  const isPublicAdminRoute =
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/forgot-password") ||
    pathname.startsWith("/admin/access-denied") ||
    pathname.startsWith("/api/admin/auth");

  if (isPublicAdminRoute) {
    return NextResponse.next();
  }

  // Define protected route segments
  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isAgentRoute = pathname.startsWith("/agent") || pathname.startsWith("/api/agent");
  const isOwnerRoute = pathname.startsWith("/owner") || pathname.startsWith("/api/owner");

  if (!isAdminRoute && !isAgentRoute && !isOwnerRoute) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // If no session token is present
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: authentication required" }, { status: 401 });
    }
    // Dedicated Command Center login for /admin
    if (isAdminRoute) {
      const adminLoginUrl = new URL("/admin/login", request.url);
      adminLoginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(adminLoginUrl);
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    const role = payload.role as string;

    // 1. Admin Route Protection: Only SUPER_ADMIN, COMMUNITY_ADMIN, MODERATOR
    if (isAdminRoute) {
      if (role !== "SUPER_ADMIN" && role !== "COMMUNITY_ADMIN" && role !== "MODERATOR") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden: administrator clearance required" }, { status: 403 });
        }
        // Redirect unauthorized roles (e.g. CUSTOMER, BUSINESS_OWNER) to Access Denied screen
        const deniedUrl = new URL("/admin/access-denied", request.url);
        return NextResponse.redirect(deniedUrl);
      }
    }

    // 2. Agent Route Protection: Only COMMUNITY_AGENT, SUPER_ADMIN
    if (isAgentRoute) {
      if (role !== "COMMUNITY_AGENT" && role !== "SUPER_ADMIN") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden: community agent privileges required" }, { status: 403 });
        }
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        loginUrl.searchParams.set("reason", "agent_required");
        return NextResponse.redirect(loginUrl);
      }
    }

    // 3. Owner Route Protection: Only BUSINESS_OWNER, SUPER_ADMIN
    if (isOwnerRoute) {
      if (role !== "BUSINESS_OWNER" && role !== "SUPER_ADMIN") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden: business proprietor privileges required" }, { status: 403 });
        }
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        loginUrl.searchParams.set("reason", "owner_required");
        return NextResponse.redirect(loginUrl);
      }
    }

    // Forward authenticated user data in headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId as string);
    requestHeaders.set("x-user-role", role);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: invalid session token" }, { status: 401 });
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
    "/agent/:path*",
    "/owner/:path*",
    "/explore",
    "/explore/:path*",
    "/search",
    "/search/:path*",
    "/business/:path*",
    "/demand",
    "/demand/:path*",
    "/community/:path*",
    "/register-business",
  ],
};
