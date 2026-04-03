"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubAccountSwitcher from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";

interface LeaveRequest {
  id: string;
  applyDate: string;
  reason: string;
  days: number;
  leaveType: string;
  status: "Pending" | "Approved" | "Rejected";
  dateFrom: string;
  dateTo: string;
}

const leaveTypes = ["Annual", "Sick", "Personal", "Casual", "Unpaid"];

export default function LeaveApplication() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

  const [formData, setFormData] = useState({
    leaveType: "Annual",
    reason: "",
    dateFrom: "",
    dateTo: "",
  });

  const calculateDays = (from: string, to: string) => {
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  const formatDateToGB = (dateString: string): string => {
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reason || !formData.dateFrom || !formData.dateTo) {
      alert("Please fill in all fields");
      return;
    }

    if (formData.dateTo < formData.dateFrom) {
      alert("To Date cannot be before From Date");
      return;
    }

    const days = calculateDays(formData.dateFrom, formData.dateTo);

    const newRequest: LeaveRequest = {
      id: String(leaveRequests.length + 1),
      applyDate: formatDateToGB(new Date().toISOString().split("T")[0]),
      reason: formData.reason,
      days: days,
      leaveType: formData.leaveType,
      status: "Pending",
      dateFrom: formatDateToGB(formData.dateFrom),
      dateTo: formatDateToGB(formData.dateTo),
    };

    setLeaveRequests([newRequest, ...leaveRequests]);
    setFormData({ leaveType: "Annual", reason: "", dateFrom: "", dateTo: "" });
    alert("Leave request submitted successfully!");
  };

  const handleCancel = (id: string) => {
    setLeaveRequests(leaveRequests.filter((req) => req.id !== id));
  };

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
          <h1 className="text-3xl font-bold text-blue-800">Apply Leave</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Leave Table */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">Leave Requests</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Apply Date
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Reason
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Days
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Leave Type
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map((request) => (
                      <tr
                        key={request.id}
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {request.applyDate}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {request.reason}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {request.days}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            {request.leaveType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              request.status === "Approved"
                                ? "bg-green-100 text-green-800"
                                : request.status === "Pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {request.status === "Pending" && (
                            <button
                              onClick={() => handleCancel(request.id)}
                              className="text-red-600 hover:text-red-800 font-semibold text-sm"
                            >
                              ✕ Cancel
                            </button>
                          )}
                          {request.status !== "Pending" && (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 bg-gray-50 text-sm text-gray-600">
                Cancel: {leaveRequests.filter((r) => r.status === "Pending").length}
              </div>
            </div>
          </div>

          {/* Add Leave Form */}
          <div className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-6">Add Leave</h3>

              <div className="space-y-5">
                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Leave Type
                  </label>
                  <select
                    value={formData.leaveType}
                    onChange={(e) =>
                      setFormData({ ...formData, leaveType: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {leaveTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="Enter reason for leave"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={formData.dateFrom}
                    onChange={(e) =>
                      setFormData({ ...formData, dateFrom: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={formData.dateTo}
                    onChange={(e) =>
                      setFormData({ ...formData, dateTo: e.target.value })
                    }
                    min={formData.dateFrom}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Days Display */}
                {formData.dateFrom && formData.dateTo && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Total Days:</span>{" "}
                      {calculateDays(formData.dateFrom, formData.dateTo)}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Submit Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}