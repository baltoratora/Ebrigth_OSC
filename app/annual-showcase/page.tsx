import Link from "next/link";

const DEPARTMENTS = [
  { title: "Organizing Committee",  icon: "🏛️", color: "bg-blue-600",   href: "/annual-showcase/oc" },
  { title: "Procurement",           icon: "🛒", color: "bg-green-600",  href: "/annual-showcase/procurement" },
  { title: "Sponsorship & VVIP",    icon: "🤝", color: "bg-yellow-500", href: "/annual-showcase/sponsorship" },
  { title: "Media & Publicity",     icon: "📣", color: "bg-pink-500",   href: "/annual-showcase/media" },
  { title: "Showcase & Production", icon: "🎤", color: "bg-purple-600", href: "/annual-showcase/showcase" },
  { title: "Logistics",             icon: "🚛", color: "bg-cyan-600",   href: "/annual-showcase/logistics" },
  { title: "Youthpreneur",          icon: "💡", color: "bg-orange-500", href: "/annual-showcase/youthpreneur" },
  { title: "CEO Unit",              icon: "👔", color: "bg-red-600",    href: "/annual-showcase/ceo" },
];

export default function AnnualShowcasePage() {
  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1">Select a department</h1>
        <p className="text-sm text-gray-500 mb-6">Navigate to any unit to get started.</p>
      </div>

      <main className="max-w-5xl mx-auto px-4 pb-6 sm:pb-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
          {DEPARTMENTS.map((dept) => (
            <Link key={dept.href} href={dept.href}>
              <div
                className={`${dept.color} text-white p-2 sm:p-3 rounded-lg flex items-center justify-center aspect-square transition-all duration-300 hover:shadow-lg hover:scale-105`}
              >
                <div className="text-center">
                  <span className="text-2xl sm:text-3xl block mb-1">{dept.icon}</span>
                  <h2 className="text-xs sm:text-sm font-bold leading-tight">{dept.title}</h2>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
