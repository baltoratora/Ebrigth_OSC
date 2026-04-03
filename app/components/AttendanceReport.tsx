"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubAccountSwitcher from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";

interface AttendanceRecord {
  no: number;
  date: string;
  inTime: string;
  outTime: string;
  inStatus: string;
  outStatus: string;
  hoursWorked: number;
  overtime: number;
  attendance: string;
  remarks?: string;
}

export default function AttendanceReport() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState("April");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const getDayOfWeek = (dateString: string): string => {
    // dateString format: "01-04-24"
    const [day, month, year] = dateString.split("-");
    const fullYear = "20" + year;
    const date = new Date(`${fullYear}-${month}-${day}`);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[date.getDay()];
  };

  const getMonthNumber = (monthName: string): number => {
    const monthIndex = months.indexOf(monthName);
    return monthIndex + 1;
  };

  const getDaysInMonth = (monthName: string): number => {
    const monthNum = getMonthNumber(monthName);
    return new Date(2024, monthNum, 0).getDate();
  };

  const generateAttendanceData = (): AttendanceRecord[] => {
    const monthNum = getMonthNumber(selectedMonth);
    const daysInMonth = getDaysInMonth(selectedMonth);
    const data: AttendanceRecord[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${String(day).padStart(2, "0")}-${String(monthNum).padStart(2, "0")}-24`;
      const dayOfWeek = getDayOfWeek(dateStr);

      // Skip weekends (Saturday and Sunday)
      if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
        continue;
      }

      // Generate random attendance (90% present, 10% absent)
      const isAbsent = Math.random() < 0.1;
      const record: AttendanceRecord = {
        no: data.length + 1,
        date: dateStr,
        inTime: isAbsent ? "—" : `${7 + Math.floor(Math.random() * 2)}:${Math.floor(Math.random() * 60).toString().padStart(2, "0")}`,
        outTime: isAbsent ? "—" : `${17 + Math.floor(Math.random() * 1)}:${Math.floor(Math.random() * 60).toString().padStart(2, "0")}`,
        inStatus: "—",
        outStatus: "—",
        hoursWorked: isAbsent ? 0 : Math.round((8 + Math.random() * 2) * 100) / 100,
        overtime: isAbsent ? 0 : Math.round(Math.random() * 2 * 100) / 100,
        attendance: isAbsent ? "Absent" : "Present",
        remarks: isAbsent ? (data.length % 2 === 0 ? "Medical appointment - Medical certificate provided" : "Family emergency - Will provide documentation") : undefined,
      };
      data.push(record);
    }

    return data;
  };

  const attendanceData = generateAttendanceData();

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
          <h1 className="text-3xl font-bold text-blue-800">Attendance Report</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Employee Information Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-6">Employee Information</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Name
                </label>
                <p className="text-gray-800 font-medium">Faiq Soudagar</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Card Number
                </label>
                <p className="text-gray-800 font-medium">08061040109-3</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Department
                </label>
                <p className="text-gray-800 font-medium">IT</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Position
                </label>
                <p className="text-gray-800 font-medium">Software Developer</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">
                  Manager/Supervisor
                </label>
                <p className="text-gray-800 font-medium">Mr. Iqbal</p>
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedMonth} Attendance Record
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        No.
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        Day
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        In Time
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        Out Time
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-gray-700">
                        Duration
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-gray-700">
                        Overtime
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-gray-700">
                        Attendance
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-gray-700">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceData.map((record, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-2 py-2 text-sm text-gray-800 font-medium">
                          {record.no}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-800 font-semibold text-blue-600">
                          {getDayOfWeek(record.date)}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-800">
                          {record.date}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-800">
                          {record.inTime}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-800">
                          {record.outTime}
                        </td>
                        <td className="px-2 py-2 text-sm text-center text-gray-800">
                          {record.hoursWorked > 0 ? `${record.hoursWorked}H` : "—"}
                        </td>
                        <td className="px-2 py-2 text-sm text-center text-orange-600 font-semibold">
                          {record.overtime > 0 ? `${record.overtime}H` : "—"}
                        </td>
                        <td className="px-2 py-2 text-sm text-center">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              record.attendance === "Present"
                                ? "bg-green-100 text-green-800"
                                : record.attendance === "Absent"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {record.attendance}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-600 truncate">
                          {record.remarks || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">
                      Total Present
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {attendanceData.filter((r) => r.attendance === "Present").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">
                      Total Absent
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {attendanceData.filter((r) => r.attendance === "Absent").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">
                      Total Hours
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {attendanceData
                        .reduce((sum, r) => sum + r.hoursWorked, 0)
                        .toFixed(2)}
                      H
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase">
                      Total Overtime
                    </p>
                    <p className="text-2xl font-bold text-orange-600">
                      {attendanceData
                        .reduce((sum, r) => sum + r.overtime, 0)
                        .toFixed(2)}
                      H
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}