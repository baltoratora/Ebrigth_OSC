"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canSeeKey } from "@/lib/dashboard-access";
import { useMyPermissions } from "@/lib/use-my-permissions";
import { isEmployee } from "@/lib/roles";

interface DashboardCard {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: {
    /** Key in DASHBOARD_TREE — drives visibility via canSeeKey. */
    key: string;
    name: string;
    href: string;
    icon: string;
  }[];
}

const dashboards: DashboardCard[] = [
  {
    id: "library",
    title: "Library",
    icon: "📚",
    color: "bg-purple-500",
    items: [
      { key: "library.documents", name: "Documents", href: "#", icon: "📄" },
      { key: "library.resources", name: "Resources", href: "#", icon: "📁" },
    ],
  },
  {
    id: "internal-dashboard",
    title: "Internal Dashboard",
    icon: "📊",
    color: "bg-green-500",
    items: [
      { key: "internal-dashboard.analytics", name: "Analytics", href: "#", icon: "📈" },
      { key: "internal-dashboard.reports",   name: "Reports",   href: "#", icon: "📋" },
    ],
  },
  {
    id: "hrms",
    title: "HRMS",
    icon: "👥",
    color: "bg-blue-500",
    items: [
      { key: "hrms.employee",         name: "Employee Dashboard",  href: "/dashboard-employee-management", icon: "📊" },
      { key: "hrms.manpower-planning",name: "Manpower Planning",   href: "/manpower-schedule",             icon: "🗂️" },
      { key: "hrms.claims",           name: "Claims",              href: "/claim",                         icon: "💰" },
      { key: "hrms.attendance",       name: "Attendance",          href: "/attendance",                    icon: "⏰" },
      { key: "hrms.attendance-manual",name: "Attendance Manual",   href: "/attendance-manual",             icon: "✍️" },
      { key: "hrms.recruitment",      name: "Recruitment",         href: "/recruitment",                   icon: "🧑‍💼" },
      { key: "hrms.onboarding",       name: "Onboarding",          href: "/onboarding",                    icon: "🟢" },
      { key: "hrms.offboarding",      name: "Offboarding",         href: "/offboarding",                   icon: "🔴" },
      { key: "hrms.hr-dashboard",     name: "HR Dashboard",        href: "/hr-dashboard",                  icon: "📋" },
      { key: "hrms.manpower-cost",    name: "Manpower Cost Report",href: "/manpower-cost-report",          icon: "💸" },
      { key: "hrms.staff-directory",  name: "Staff Directory",     href: "/staff-directory",               icon: "📇" },
    ],
  },
  {
    id: "crm",
    title: "CNS",
    icon: "🤝",
    color: "bg-yellow-500",
    items: [
      // Lead and Ticket are the only CRM entry points — both land on their
      // respective dashboards first, where users drill into kanban / lists.
      { key: "crm.lead",   name: "Lead",   href: "/crm/dashboard",         icon: "📋" },
      { key: "crm.ticket", name: "Ticket", href: "/crm/tickets/dashboard", icon: "🎫" },
    ],
  },
  {
    id: "cms",
    title: "CMS",
    icon: "📰",
    color: "bg-yellow-500",
    items: [
      { key: "cms.content-manager", name: "Content Manager", href: "#", icon: "✏️" },
      { key: "cms.media",           name: "Media",           href: "#", icon: "🖼️" },
    ],
  },
  {
    id: "sms",
    title: "SMS",
    icon: "💬",
    color: "bg-indigo-500",
    items: [
      { key: "sms.messages",  name: "Messages",  href: "#",        icon: "💌" },
      { key: "sms.templates", name: "Templates", href: "/sms",     icon: "📧" },
      { key: "sms.burnlist",  name: "Burnlist",  href: "/burnlist", icon: "🔥" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: "📦",
    color: "bg-pink-500",
    items: [
      { key: "inventory.stock",     name: "Stock Management", href: "#", icon: "📊" },
      { key: "inventory.warehouse", name: "Warehouse",        href: "#", icon: "🏭" },
    ],
  },
  {
    id: "academy",
    title: "Academy",
    icon: "🎓",
    color: "bg-indigo-600",
    items: [
      { key: "academy.events",  name: "Event Management", href: "/academy", icon: "📅" },
      { key: "academy.courses", name: "Courses",          href: "#",        icon: "📖" },
    ],
  },
];

interface DashboardDetailProps {
  id: string;
}

export default function DashboardDetail({ id }: DashboardDetailProps) {
  const router = useRouter();
  const { role, overrides } = useMyPermissions();
  const dashboard = dashboards.find((d) => d.id === id);

  const isItemEnabled = (key: string) => canSeeKey(role, key, overrides);

  // FT/PT share the "Attendance" tile's unlock (hrms.attendance) so it isn't
  // greyed out for them, but they don't get the /attendance hub itself
  // (Summary/Appeal/Leave show other staff's data) — send them straight to
  // their own self-scoped Report page instead. See middleware.ts, which only
  // allowlists /attendance/report for FT/PT, never bare /attendance.
  const resolveHref = (item: { key: string; href: string }) =>
    item.key === "hrms.attendance" && isEmployee(role) ? "/attendance/report" : item.href;

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Dashboard Not Found</h1>
          <button
            onClick={() => router.push('/home')}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      
      {/* Header Box */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <div className={`${dashboard.color} text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md`}>
          <span className="text-xl">{dashboard.icon}</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            {dashboard.title}
          </h1>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboard.items.map((item) => {
          const enabled = isItemEnabled(item.key);
          if (!enabled) {
            return (
              <div
                key={item.name}
                aria-disabled="true"
                className="bg-slate-100 rounded-2xl shadow-sm border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-center cursor-not-allowed opacity-50"
              >
                <span className="text-5xl mb-4 grayscale">{item.icon}</span>
                <h2 className="text-lg font-black text-slate-500 uppercase tracking-tight">{item.name}</h2>
              </div>
            );
          }
          return (
            <Link key={item.name} href={resolveHref(item)}>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer p-8 h-full flex flex-col items-center justify-center text-center">
                <span className="text-5xl mb-4">{item.icon}</span>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">{item.name}</h2>
              </div>
            </Link>
          );
        })}
      </div>

    </div>
  );
}