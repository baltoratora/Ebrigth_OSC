"use client";

import Link from "next/link";

interface SidebarProps {
  sidebarOpen: boolean;
  onCollapse?: () => void;
}

const navigationItems = [
  { name: "Home", href: "/home", icon: "🏠" },
  { name: "Library", href: "/dashboards/library", icon: "📚" },
  { name: "Internal Dashboard", href: "/dashboards/internal-dashboard", icon: "📊" },
  { name: "HRMS", href: "/dashboards/hrms", icon: "👥" },
  { name: "CRM", href: "/dashboards/crm", icon: "📰" },
  { name: "SMS", href: "/dashboards/sms", icon: "💬" },
  { name: "Inventory", href: "/dashboards/inventory", icon: "📦" },
  { name: "Academy", href: "/academy", icon: "🎓" },
  { name: "Attendance", href: "/attendance", icon: "📅" },
  { name: "Account Management", href: "/account-management", icon: "🔐" },
];

export default function Sidebar({ sidebarOpen, onCollapse }: SidebarProps) {
  return (
    <aside
      className={`bg-white shadow-lg overflow-hidden transition-all duration-300 flex flex-col ${
        sidebarOpen ? "w-64" : "w-0"
      }`}
    >
      <nav className="p-6 space-y-2 flex-1 overflow-y-auto">
        {navigationItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-gray-700 hover:bg-gray-100 whitespace-nowrap"
          >
            <span>{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>

      <div className="p-6 border-t border-gray-200">
        <button
          onClick={onCollapse}
          className="w-full px-4 py-3 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
        >
          ✕ Hide Sidebar
        </button>
      </div>
    </aside>
  );
}
