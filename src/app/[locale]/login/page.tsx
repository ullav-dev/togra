"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { requestPasswordReset } from "@/lib/auth-api";
import TograIcon from "@/components/TograIcon";

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm w-full focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
    >
      {loading ? "Please wait…" : label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
      {message}
    </div>
  );
}

function LoginPageContent() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<"form" | "reset-request">("form");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (searchParams.get("error") === "no_access") {
      setError("Your account does not have access to Togra. Ask your team owner to enable Obair for your team.");
    }
  }, [searchParams]);

  function errMsg(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : "";
    if (/^HTTP 5/.test(msg)) return "Server error. Please try again.";
    if (msg === "no_togra_access") return "Your account does not have access to Togra.";
    return msg || fallback;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(errMsg(err, "Login failed. Please check your credentials."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(resetEmail, window.location.origin);
      setResetSent(true);
    } catch (err) {
      setError(errMsg(err, "Could not send reset link."));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  if (stage === "reset-request") {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md p-8">
          <div className="flex items-center gap-2 mb-6">
            <TograIcon className="w-7 h-7" />
            <span className="font-bold text-lg text-slate-800">Reset password</span>
          </div>
          {error && <ErrorBox message={error} />}
          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📧</div>
              <p className="text-sm text-slate-600">Check your inbox for the password reset link.</p>
              <button type="button" onClick={() => { setStage("form"); setError(null); setResetSent(false); }} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <Field label="Email" htmlFor="reset-email">
                <input id="reset-email" type="email" required autoFocus value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={inputCls} />
              </Field>
              <SubmitButton loading={submitting} label="Send reset link" />
              <button type="button" onClick={() => { setStage("form"); setError(null); }} className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md p-8">
        <div className="flex items-center gap-2.5 mb-8">
          <TograIcon className="w-8 h-8" />
          <div>
            <span className="font-bold text-lg text-slate-800 block">Togra</span>
            <span className="text-xs text-slate-500">Project Planning</span>
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        <form onSubmit={handleLogin} className="space-y-4">
          <Field label="Email" htmlFor="login-email">
            <input id="login-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </Field>
          <SubmitButton loading={submitting} label="Sign in" />
          <div className="text-center">
            <button type="button" onClick={() => { setStage("reset-request"); setError(null); }} className="text-sm text-slate-500 hover:text-violet-700 transition-colors">
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
