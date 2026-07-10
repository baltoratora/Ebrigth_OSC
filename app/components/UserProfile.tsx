"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

interface ProfileData {
  id:       string;
  name:     string;
  nickname: string;
  email:    string;
  branch:   string;
  role:     string;
  phone:    string;
}

const FIELD_LABEL = "block text-xs font-bold uppercase tracking-wider text-slate-500";
const FIELD_VALUE = "mt-1 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm";

export default function UserProfile() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [profile, setProfile]       = useState<ProfileData | null>(null);

  const [current, setCurrent]       = useState("");
  const [next, setNext]             = useState("");
  const [confirm, setConfirm]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback]     = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) {
          setError("Failed to load profile");
          return;
        }
        setProfile(await res.json());
      } catch {
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!current || !next || !confirm) {
      setFeedback({ kind: "error", text: "All password fields are required." });
      return;
    }
    if (next.length < 8) {
      setFeedback({ kind: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setFeedback({ kind: "error", text: "New password and confirmation do not match." });
      return;
    }
    if (next === current) {
      setFeedback({ kind: "error", text: "New password must be different from the current password." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFeedback({ kind: "error", text: data?.error || "Failed to update password." });
        return;
      }

      setFeedback({
        kind: "success",
        text: "Password updated. Signing you out so you can log back in with the new password…",
      });
      setCurrent(""); setNext(""); setConfirm("");
      // Force a fresh login. The JWT cookie remains valid until expiry, so
      // signOut() is the deterministic way to invalidate the current session.
      setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
    } catch {
      setFeedback({ kind: "error", text: "Failed to update password." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="mt-4 text-slate-600">Loading profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center text-red-600">
        <p className="font-medium">{error ?? "No profile data available"}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left: read-only profile */}
      <section className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Your profile</h2>
        <p className="text-sm text-slate-500 mb-6">
          These fields are read-only. Contact HR if anything needs to change.
        </p>

        <div className="space-y-4">
          <div>
            <label className={FIELD_LABEL}>Name</label>
            <div className={FIELD_VALUE}>{profile.name || "—"}</div>
          </div>
          <div>
            <label className={FIELD_LABEL}>Email</label>
            <div className={FIELD_VALUE}>{profile.email || "—"}</div>
          </div>
          <div>
            <label className={FIELD_LABEL}>Branch</label>
            <div className={FIELD_VALUE}>{profile.branch || "—"}</div>
          </div>
          <div>
            <label className={FIELD_LABEL}>Contact number</label>
            <div className={FIELD_VALUE}>{profile.phone || "—"}</div>
          </div>
        </div>
      </section>

      {/* Right: change password */}
      <section className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Change password</h2>
        <p className="text-sm text-slate-500 mb-6">
          After saving, you will be signed out and asked to log in with your new password.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={FIELD_LABEL}>Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              disabled={submitting}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              disabled={submitting}
              minLength={8}
            />
            <p className="text-xs text-slate-500 mt-1">Minimum 8 characters.</p>
          </div>
          <div>
            <label className={FIELD_LABEL}>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              disabled={submitting}
              minLength={8}
            />
          </div>

          {feedback && (
            <div
              className={
                feedback.kind === "error"
                  ? "rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3"
                  : "rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm px-4 py-3"
              }
            >
              {feedback.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
