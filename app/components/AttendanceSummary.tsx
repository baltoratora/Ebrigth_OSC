"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SubAccountSwitcher from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";

interface EmployeeClocking {
  id: string;
  name: string;
  empId: string;
  date: string;
  time: string;
  type: "Clock In" | "Clock Out";
  status: "Normal" | "Late" | "Early";
  location: string;
}

export default function AttendanceSummary() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const stats = {
    present: 46,
    absent: 108,
    onTime: 0,
    lateInEarlyOut: 0,
    overtime: 160,
    onShift: 0,
    completeWrkHrs: 0,
    incompleteWrkHrs: 0,
  };

  const attendanceTypeData = [
    { type: "On Shift", count: 160 },
    { type: "Absent", count: 108 },
    { type: "On Leave", count: 7 },
    { type: "Late In / Early Out", count: 0 },
    { type: "Overtime", count: 0 },
    { type: "Incomplete Working Hours", count: 0 },
    { type: "Attended", count: 46 },
  ];

  const clockingData: EmployeeClocking[] = [
    {
      id: "1",
      name: "NUREEN UMAIRA BINTI ROSLI",
      empId: "EBPT091",
      date: "Wed, 25 Mar 2026",
      time: "08:13",
      type: "Clock In",
      status: "Normal",
      location: "Geolocation",
    },
    {
      id: "2",
      name: "NUREEN UMAIRA BINTI ROSLI",
      empId: "EBPT091",
      date: "Wed, 25 Mar 2026",
      time: "18:10",
      type: "Clock Out",
      status: "Normal",
      location: "Geolocation",
    },
    {
      id: "3",
      name: "NAQIB AL HUSSAINI BIN NOR ANUAR",
      empId: "EBPT099",
      date: "Wed, 25 Mar 2026",
      time: "07:54",
      type: "Clock In",
      status: "Normal",
      location: "Geolocation",
    },
    {
      id: "4",
      name: "KIRTIKHA D/O NARAYANAN",
      empId: "EBPT112",
      date: "Wed, 25 Mar 2026",
      time: "07:49",
      type: "Clock In",
      status: "Normal",
      location: "Geolocation",
    },
    {
      id: "5",
      name: "MUHAMMAD FAIZAL BIN MOHD RIZALMAN",
      empId: "EBPT136",
      date: "Wed, 25 Mar 2026",
      time: "08:48",
      type: "Clock In",
      status: "Normal",
      location: "Geolocation",
    },
  ];

  const StatCard = ({
    title,
    subtitle,
    mainValue,
    secondaryValue,
    color,
  }: {
    title: string;
    subtitle: string;
    mainValue: number;
    secondaryValue: number;
    color: string;
  }) => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-32 mb-4">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="#f0f0f0"
              strokeWidth="12"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeDasharray={`${(mainValue / (mainValue + secondaryValue)) * 351.68} 351.68`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-gray-800">{mainValue}</p>
            <p className="text-xs text-gray-600">{title}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">{secondaryValue}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
      <div className="flex-1">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4">            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Toggle Sidebar"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>          <SubAccountSwitcher />
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-blue-800">My Team Attendance</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Present"
            subtitle="Absent"
            mainValue={stats.present}
            secondaryValue={stats.absent}
            color="#3b82f6"
          />
          <StatCard
            title="On Time"
            subtitle="Late In / Early Out"
            mainValue={stats.onTime}
            secondaryValue={stats.lateInEarlyOut}
            color="#f59e0b"
          />
          <StatCard
            title="Overtime"
            subtitle="On Shift"
            mainValue={stats.overtime}
            secondaryValue={stats.onShift}
            color="#10b981"
          />
          <StatCard
            title="Complete Wk Hrs"
            subtitle="Incomplete Wk Hrs"
            mainValue={stats.completeWrkHrs}
            secondaryValue={stats.incompleteWrkHrs}
            color="#8b5cf6"
          />
        </div>

        {/* Attendance Type Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Attendance Type</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Attendance Type
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                    Employee No.
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendanceTypeData.map((item, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-sm text-gray-800">
                      <a href="#" className="text-blue-600 hover:underline">
                        {item.type}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-gray-800">
                      {item.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team Clocking Data */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Team Clocking Records</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Clock Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody>
                {clockingData.map((record, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {record.date}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {record.time}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <div className="font-semibold">{record.name}</div>
                      <div className="text-xs text-gray-600">{record.empId}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                          record.type === "Clock In"
                            ? "bg-green-500"
                            : "bg-red-500"
                        }`}
                      >
                        {record.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <a href="#" className="text-blue-600 hover:underline">
                        {record.location}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}