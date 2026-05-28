// Typed wrappers for ullav-user-management. Requests go via /auth-api/* rewrite in the browser.

const BASE =
  typeof window === "undefined"
    ? (process.env.AUTH_URL ?? "http://localhost:8081")
    : "/auth-api";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  roles: string[];
  permissions: string[];
}

async function authRequest<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return undefined as T;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.message ?? data.detail ?? `HTTP ${res.status}`);
  return data as T;
}

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export const login = (email: string, password: string): Promise<LoginResponse> =>
  authRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const requestPasswordReset = (
  email: string,
  app_url?: string
): Promise<{ reset_token?: string; message?: string }> =>
  authRequest("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email, ...(app_url ? { app_url } : {}) }),
  });

export const confirmPasswordReset = (token: string, new_password: string): Promise<void> =>
  authRequest("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });

// ── Team-level product access (piggybacking on obair gate) ───────────────────

export interface TeamClaim {
  name: string;
  role: string;
  team_roles: string[];
  product_roles: Record<string, string>;
  products: string[];
}

export function getTeamClaims(token: string | null): Record<string, TeamClaim> {
  if (!token) return {};
  const payload = decodePayload(token);
  if (!payload) return {};
  return (payload.teams ?? {}) as Record<string, TeamClaim>;
}

/** Togra uses the obair product gate for access control. */
export function hasTograAccess(token: string | null): boolean {
  const teams = getTeamClaims(token);
  return Object.values(teams).some((t) => (t.products ?? []).includes("obair"));
}

export function getObairTeamIds(token: string | null): string[] {
  const teams = getTeamClaims(token);
  return Object.entries(teams)
    .filter(([, t]) => (t.products ?? []).includes("obair"))
    .map(([id]) => id);
}

export function isAdmin(token: string | null): boolean {
  if (!token) return false;
  const payload = decodePayload(token);
  if (!payload) return false;
  return ((payload.roles ?? []) as string[]).includes("admin");
}

// ── Profile ───────────────────────────────────────────────────────────────────

export const getMe = (token: string): Promise<AuthUser> =>
  authRequest("/users/me", {}, token);

export interface UpdateProfilePayload {
  first_name?: string | null;
  last_name?: string | null;
  /** Pass null to clear; omit to leave unchanged. */
  avatar_url?: string | null;
}

export const updateProfile = (token: string, data: UpdateProfilePayload): Promise<AuthUser> =>
  authRequest("/users/me", { method: "PATCH", body: JSON.stringify(data) }, token);

export async function gravatarUrl(email: string, size = 200): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `https://gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}
