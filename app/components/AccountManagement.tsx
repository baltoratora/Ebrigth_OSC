"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { ALL_ROLES } from "@/lib/roles";
import { DASHBOARD_TREE, canAccess, parseOverrides, type DashboardOverrides, type DashboardNode } from "@/lib/dashboard-access";


// ─── Types ────────────────────────────────────────────────────────────────────

interface UserAccount {
  id: number;
  name: string | null;
  email: string;
  role: string;
  branchName: string | null;
  createdAt: string;
  lastLoggedInAt: string | null;
  dashboardOverrides?: unknown;
}

type ModalMode = "create" | "edit" | "permission" | null;

// Pulled from the canonical list so the dropdown can never offer a value the
// /api/users zod validator will reject.
const SYSTEM_ROLES = ALL_ROLES;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLastLogin(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: string }) {
  const colours: Record<string, string> = {
    SUPER_ADMIN: "bg-purple-100 text-purple-800",
    ADMIN: "bg-blue-100 text-blue-800",
    BRANCH_MANAGER: "bg-indigo-100 text-indigo-800",
    HOD: "bg-cyan-100 text-cyan-800",
    EXECUTIVE: "bg-green-100 text-green-800",
    INTERN: "bg-yellow-100 text-yellow-800",
    Full_Time: "bg-emerald-100 text-emerald-800",
    Part_Time: "bg-amber-100 text-amber-800",
  };
  const cls = colours[role] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

// ─── Permission editor (editable tree) ───────────────────────────────────────
//
// Renders the dashboard tree from lib/dashboard-access.ts with a checkbox per
// node. Each toggle writes an explicit override on top of the role default.
// "Reset to role default" clears every override. Saved as a JSON column on
// the User row — see /api/users PATCH update-permissions.

// Every key in `node` plus all of its descendants, at any depth.
function subtreeKeys(node: DashboardNode): string[] {
  return [node.key, ...(node.children ?? []).flatMap(subtreeKeys)];
}

function TreeRow({
  node,
  role,
  overrides,
  onChange,
  depth,
}: {
  node: DashboardNode;
  role: string;
  overrides: DashboardOverrides;
  onChange: (next: DashboardOverrides) => void;
  depth: number;
}) {
  const children = node.children ?? [];
  const allowed = canAccess(role, node.key, overrides);
  const descendantKeys = subtreeKeys(node).slice(1); // excludes node.key itself
  const someDescendantAllowed = descendantKeys.some((k) => canAccess(role, k, overrides));
  const allDescendantsAllowed = descendantKeys.length > 0 && descendantKeys.every((k) => canAccess(role, k, overrides));
  const indeterminate = children.length > 0 && (allowed || someDescendantAllowed) && !(allowed && allDescendantsAllowed);
  const rowType: "Role Default" | "Custom" = node.key in overrides ? "Custom" : "Role Default";

  // Ticking/unticking a node with children is a bulk action over the whole
  // subtree (self + every descendant at any depth) — matches admin intuition:
  // checking "Manpower Planning" should grant all of its sub-pages too.
  // Leaf nodes just flip their own key.
  function toggle() {
    const allOn = allowed && allDescendantsAllowed;
    const value: "ALLOWED" | "DENIED" = children.length > 0 ? (allOn ? "DENIED" : "ALLOWED") : (allowed ? "DENIED" : "ALLOWED");
    const next = { ...overrides };
    for (const k of subtreeKeys(node)) next[k] = value;
    onChange(next);
  }

  return (
    <div style={depth > 0 ? { marginLeft: depth * 24 } : undefined} className={depth === 0 ? "px-3 py-2" : "mt-1"}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allowed}
          ref={(el) => { if (el) el.indeterminate = indeterminate; }}
          onChange={toggle}
          className={depth === 0 ? "h-4 w-4 accent-blue-600 cursor-pointer" : "h-3.5 w-3.5 accent-blue-600 cursor-pointer"}
        />
        {depth === 0 && <span className="text-base">{node.icon}</span>}
        <span className={`${depth === 0 ? "text-sm font-semibold" : "text-xs"} flex-1 ${allowed ? (depth === 0 ? "text-gray-800" : "text-gray-700") : "text-gray-400"}`}>
          {node.label}
        </span>
        <span className={`text-[10px] uppercase font-semibold tracking-wider ${rowType === "Custom" ? "text-blue-600" : "text-gray-400"}`}>
          {rowType}
        </span>
      </div>
      {children.length > 0 && (
        <div className={depth === 0 ? "ml-7 mt-1 space-y-1" : "space-y-1"}>
          {children.map((child) => (
            <TreeRow key={child.key} node={child} role={role} overrides={overrides} onChange={onChange} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionTree({
  role,
  overrides,
  onChange,
}: {
  role: string;
  overrides: DashboardOverrides;
  onChange: (next: DashboardOverrides) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
          Dashboard access
        </span>
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
          disabled={Object.keys(overrides).length === 0}
        >
          Reset to role defaults
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
        {DASHBOARD_TREE.map((parent) => (
          <TreeRow key={parent.key} node={parent} role={role} overrides={overrides} onChange={onChange} depth={0} />
        ))}
      </div>
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-500">
        Defaults come from the user&apos;s role. Toggling a row marks it <span className="text-blue-600 font-semibold">Custom</span>.
      </div>
    </div>
  );
}


// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  mode: ModalMode;
  user: UserAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ mode, user, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role ?? "BRANCH_MANAGER");
  const [branchName, setBranchName] = useState(user?.branchName ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Per-user dashboard overrides — only used in permission mode. Seeded from
  // the user row the table already has; we don't re-fetch.
  const [overrides, setOverrides] = useState<DashboardOverrides>(
    () => parseOverrides(user?.dashboardOverrides),
  );

  const title =
    mode === "create"
      ? "Add User"
      : mode === "edit"
      ? "Edit User"
      : "Manage Permissions";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (mode === "permission") {
        // If role changed, persist that first so role-default lookups on the
        // server line up with the overrides we're about to write.
        if (role !== user!.role) {
          const roleRes = await fetch("/api/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: user!.id, action: "change-role", role }),
          });
          if (!roleRes.ok) {
            const d = await roleRes.json();
            throw new Error(d.error ?? "Failed to change role");
          }
        }
        const permRes = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user!.id, action: "update-permissions", overrides }),
        });
        if (!permRes.ok) {
          const d = await permRes.json();
          throw new Error(d.error ?? "Failed to save permissions");
        }
      } else if (mode === "create") {
        if (!password) throw new Error("Password is required");
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, role, branchName: branchName || null }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Failed to create user");
        }
      } else {
        // edit
        const body: Record<string, unknown> = { id: user!.id, name, email, role, branchName: branchName || null };
        if (password) body.password = password;
        const res = await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Failed to update user");
        }
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${mode === "permission" ? "max-w-lg" : "max-w-md"} mx-4 overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-4 bg-blue-600 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Role selector — always visible */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Editable permission tree — only in permission mode */}
          {mode === "permission" && (
            <PermissionTree role={role} overrides={overrides} onChange={setOverrides} />
          )}

          {/* Full fields only for create/edit */}
          {mode !== "permission" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kevin Khoo"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="user@ebright.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {mode === "edit" && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={mode === "create"}
                    placeholder={mode === "edit" ? "••••••••" : "Min. 8 characters"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Klang"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AccountManagement() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("ALL");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const data: UserAccount[] = await res.json();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openModal(mode: ModalMode, user: UserAccount | null = null) {
    setSelectedUser(user);
    setModalMode(mode);
  }

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
  }

  function handleSaved() {
    closeModal();
    fetchUsers();
  }

  // Filter
  const filtered = users.filter((u) => {
    const matchSearch =
      search === "" ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "ALL" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeRecently = users.filter(
    (u) => u.lastLoggedInAt && new Date(u.lastLoggedInAt).getTime() >= sevenDaysAgo,
  ).length;
  const neverLoggedIn = users.filter((u) => !u.lastLoggedInAt).length;

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onCollapse={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4 flex-wrap">
            <button onClick={() => router.back()} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-blue-800">Account Management</h1>
            <div className="ml-auto">
              <button
                onClick={() => openModal("create")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 w-full">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-blue-600">{users.length}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Total Accounts</p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-green-600">{activeRecently}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Logged in (last 7 days)</p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-gray-400">{neverLoggedIn}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Never logged in</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-md px-6 py-4 mb-6 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Roles</option>
              {SYSTEM_ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
              ))}
            </select>
            <span className="ml-auto text-sm text-gray-400">
              {filtered.length} of {users.length} accounts
            </span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Branch</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Last Logged In</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Date Joined</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400 text-sm">
                        Loading accounts…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400 text-sm">
                        No accounts found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                              {(u.branchName ?? u.email).slice(0, 2)}
                            </div>
                            <span className="text-sm font-semibold text-gray-800">
                              {u.branchName ?? <span className="text-gray-400 font-normal italic">—</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3 text-sm text-gray-500">{u.branchName ?? "—"}</td>
                        <td className={`px-4 py-3 text-sm ${u.lastLoggedInAt ? "text-gray-500" : "text-gray-400 italic"}`}>
                          {formatLastLogin(u.lastLoggedInAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Permission — change role */}
                            <button
                              onClick={() => openModal("permission", u)}
                              title="Change role"
                              className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => openModal("edit", u)}
                              title="Edit user"
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      {modalMode && (
        <UserModal
          mode={modalMode}
          user={selectedUser}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
