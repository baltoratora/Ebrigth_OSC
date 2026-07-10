"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck, Eye, EyeOff, Lock, Mail, UserPlus } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpPage() {
  const router = useRouter();

  // Two-step flow: enter + verify the email, then reveal the password fields.
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState("");
  const [staffName, setStaffName] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setVerifyError("Please enter a valid email address.");
      return;
    }

    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.eligible) {
        setEmail(trimmed);
        setStaffName(typeof data.name === "string" ? data.name : null);
        setVerified(true);
      } else {
        setVerifyError(data.error || "We couldn't verify this email. Please try again.");
      }
    } catch {
      setVerifyError("A network error occurred. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        router.push("/login?registered=1");
      } else {
        setSubmitError(data.error || "Could not create your account. Please try again.");
      }
    } catch {
      setSubmitError("A network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetToEmail = () => {
    setVerified(false);
    setStaffName(null);
    setPassword("");
    setConfirmPassword("");
    setSubmitError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }}></div>
        </div>
      </div>

      {/* Sign-up card */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <Link href="/login" className="inline-flex items-center text-blue-300 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to login
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl mb-4 shadow-lg">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
            <p className="text-blue-200 text-sm">
              {verified ? "Choose a password to finish setting up." : "Enter your staff email to get started."}
            </p>
          </div>

          {/* Step 1 — verify email */}
          {!verified && (
            <form onSubmit={handleVerify} className="space-y-6" autoComplete="off">
              {verifyError && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/20 border border-red-500/50 text-red-100 text-sm py-2.5 px-3 rounded-xl font-medium">
                  <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{verifyError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="signup-email" className="block text-sm font-medium text-blue-100 ml-1">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-blue-300" />
                  </div>
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@ebright.my"
                    className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={verifying}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {verifying ? "Verifying..." : "Verify Email"}
              </button>
            </form>
          )}

          {/* Step 2 — set password */}
          {verified && (
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              {/* Verified email summary */}
              <div className="flex items-center justify-between gap-2 bg-emerald-500/20 border border-emerald-500/50 text-emerald-100 text-sm py-2.5 px-3 rounded-xl">
                <span className="flex items-start gap-2 min-w-0">
                  <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="truncate">{email}</span>
                </span>
                <button
                  type="button"
                  onClick={resetToEmail}
                  className="shrink-0 text-emerald-200 hover:text-white underline underline-offset-2 transition-colors"
                >
                  Change
                </button>
              </div>

              {staffName && (
                <p className="text-blue-200 text-sm ml-1">
                  Welcome, <span className="font-semibold text-white">{staffName}</span>.
                </p>
              )}

              {submitError && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/20 border border-red-500/50 text-red-100 text-sm py-2.5 px-3 rounded-xl font-medium">
                  <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}

              <PasswordField
                id="signup-password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                hint="At least 8 characters."
                status={
                  password.length === 0
                    ? null
                    : password.length >= 8
                      ? { ok: true, text: "Password length looks good" }
                      : { ok: false, text: "Password must be at least 8 characters" }
                }
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoFocus
              />

              <PasswordField
                id="signup-confirm"
                label="Retype Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                status={
                  confirmPassword.length === 0
                    ? null
                    : confirmPassword === password
                      ? { ok: true, text: "Passwords match" }
                      : { ok: false, text: "Passwords do not match" }
                }
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {submitting ? "Creating account..." : "Create Account"}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-blue-200 text-sm">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-300 font-semibold hover:text-white transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  status,
  show,
  onToggle,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  /** Live validation feedback. null = show the neutral hint instead. */
  status?: { ok: boolean; text: string } | null;
  show: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
}) {
  // Tint the border + focus ring to match the validation state while typing.
  const borderClass = !status
    ? "border-white/20 focus:ring-blue-500"
    : status.ok
      ? "border-emerald-400/60 focus:ring-emerald-500"
      : "border-red-400/60 focus:ring-red-500";

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-blue-100 ml-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Lock className="w-5 h-5 text-blue-300" />
        </div>
        <input
          id={id}
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className={`w-full pl-12 pr-12 py-3 bg-white/10 border rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${borderClass}`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-300 hover:text-white transition-colors"
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      {status ? (
        <span
          className={`flex items-center gap-1.5 ml-1 text-xs font-medium ${status.ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {status.ok ? <CircleCheck className="w-3.5 h-3.5" aria-hidden="true" /> : <CircleAlert className="w-3.5 h-3.5" aria-hidden="true" />}
          {status.text}
        </span>
      ) : (
        hint && <span className="block ml-1 text-xs text-blue-200/80">{hint}</span>
      )}
    </div>
  );
}
