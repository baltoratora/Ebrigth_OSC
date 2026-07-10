"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react"; // <-- 1. IMPORT THIS

interface UserHeaderProps {
  userName?: string;
  userEmail?: string;
}

export default function UserHeader({
  userName = "Admin User",
  userEmail = "admin@ebright.com"
}: UserHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pull the full name from the user's BranchStaff record (matched by email).
  // Falls back to the prop while loading / if there's no staff match, so the
  // header never renders blank.
  const [staffName, setStaffName] = useState<string | null>(null);
  const [staffEmail, setStaffEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.name === "string" && data.name.trim()) setStaffName(data.name.trim());
        if (typeof data.email === "string" && data.email) setStaffEmail(data.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = staffName || userName;
  const displayEmail = staffEmail || userEmail;
  const initials =
    displayName.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "U";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- 2. UPDATED LOGOUT LOGIC ---
  const handleLogout = async () => {
    // This clears the NextAuth cookie and redirects to /login
    await signOut({ 
      callbackUrl: "/login",
      redirect: true 
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Profile Button */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors"
      >
        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
          {initials}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-sm font-semibold text-white">{displayName}</p>
        </div>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {/* User Info */}
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900">{displayName}</p>
            <p className="text-xs text-gray-500 mt-1">{displayEmail}</p>
          </div>

          {/* Menu Items */}
          <div className="py-2 text-slate-700"> {/* Added text color for visibility */}
            <Link
              href="/home"
              className="block px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              onClick={() => setDropdownOpen(false)}
            >
              🏠 Home
            </Link>
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              onClick={() => setDropdownOpen(false)}
            >
              👤 My Profile
            </Link>

          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 p-2">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors flex items-center gap-2 font-bold"
            >
              🚪 Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}