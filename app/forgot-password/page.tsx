"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, KeyRound, CircleAlert } from "lucide-react";
import { resetPassword, type ResetPasswordResult } from "./actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ResetPasswordResult | null, FormData>(resetPassword, null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }}></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <Link href="/login" className="inline-flex items-center text-blue-300 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to login
          </Link>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl mb-4 shadow-lg">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
            <p className="text-blue-200 text-sm">Verify your current password, then choose a new one.</p>
          </div>

          <form action={formAction} className="space-y-5" autoComplete="off">
            {state?.error && (
              <div role="alert" className="flex items-start gap-2 bg-red-500/20 border border-red-500/50 text-red-100 text-sm py-2.5 px-3 rounded-xl font-medium">
                <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{state.error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="reset-email" className="block text-sm font-medium text-blue-100 ml-1">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-blue-300" />
                </div>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@ebright.my"
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <PasswordField
              id="reset-current"
              label="Current Password"
              name="currentPassword"
              autoComplete="current-password"
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />

            <PasswordField
              id="reset-new"
              label="New Password"
              name="newPassword"
              autoComplete="new-password"
              minLength={8}
              hint="At least 8 characters."
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
            />

            <PasswordField
              id="reset-confirm"
              label="Retype New Password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              {pending ? "Updating..." : "Reset Password"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-blue-200 text-sm">© 2026 HR System. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  name,
  autoComplete,
  minLength,
  hint,
  show,
  onToggle,
}: {
  id: string;
  label: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  hint?: string;
  show: boolean;
  onToggle: () => void;
}) {
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
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
      {hint && <span className="block ml-1 text-xs text-blue-200/80">{hint}</span>}
    </div>
  );
}
