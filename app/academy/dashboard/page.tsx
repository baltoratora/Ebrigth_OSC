"use client";

import AcademyEventManagement from "@/app/components/AcademyEventManagement";
import EventEntry from "@/app/components/EventEntry";

export default function AcademyDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-center text-red-600 mb-2">
            Academy Dashboard
          </h1>
          <p className="text-center text-gray-600">Event Management & Listings</p>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Academy Event Management - Left Side (2 columns) */}
          <div className="lg:col-span-2">
            <AcademyEventManagement />
          </div>

          {/* Event Entry Panel - Right Side (1 column) */}
          <div className="lg:col-span-1">
            <EventEntry />
          </div>
        </div>
      </main>
    </div>
  );
}
