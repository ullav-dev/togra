"use client";

// SSO handoff page — called by ullav-portal when launching this app.
// URL format: /en/auth/sso?t=<encoded-session>
//
// Enforces the team-level Togra access gate: the token must include at least
// one team with the "togra" (or legacy "obair") product enabled.

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth-api";
import { hasTograAccess, isAdmin } from "@/lib/auth-api";
import { useAuth } from "@/contexts/AuthContext";

function SsoHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setSession } = useAuth();

  useEffect(() => {
    const raw = searchParams.get("t");
    if (!raw) { router.replace("/login"); return; }
    try {
      const session = JSON.parse(decodeURIComponent(raw)) as { token: string; user: AuthUser; roles: string[] };
      if (!session.token || !session.user || !session.roles) throw new Error("invalid");
      if (!hasTograAccess(session.token) && !isAdmin(session.token)) { router.replace("/login?error=no_togra_access"); return; }
      setSession(session);
      router.replace("/projects");
    } catch {
      router.replace("/login");
    }
  }, [searchParams, router, setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-400 text-sm">Signing you in…</p>
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-slate-400 text-sm">Signing you in…</p></div>}>
      <SsoHandler />
    </Suspense>
  );
}
