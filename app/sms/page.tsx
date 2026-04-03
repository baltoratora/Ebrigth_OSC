"use client";

import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function SMSPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "attendance" | "enrollment" | "invoices" | "grades" | "freeze">("dashboard");

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "students", label: "Students", icon: "👨‍🎓" },
    { id: "attendance", label: "Attendance", icon: "📋" },
    { id: "enrollment", label: "Enrollment", icon: "📝" },
    { id: "invoices", label: "Invoices", icon: "💳" },
    { id: "grades", label: "Grades", icon: "⭐" },
    { id: "freeze", label: "Freeze Student", icon: "❄️" },
    { id: "package", label: "Packages", icon: "📦" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
          <div>
            <h1 className="text-3xl font-bold">SMS (School Management)</h1>
            <p className="text-indigo-100 mt-1">Student & Academic Management</p>
          </div>
          <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Tab Navigation */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`p-4 rounded-lg font-semibold transition-all text-center ${
                    activeTab === item.id
                      ? "bg-indigo-600 text-white shadow-lg scale-105"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="text-xs">{item.label}</div>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              {activeTab === "dashboard" && <DashboardTab />}
              {activeTab === "students" && <StudentsTab />}
              {activeTab === "attendance" && <AttendanceTab />}
              {activeTab === "enrollment" && <EnrollmentTab />}
              {activeTab === "invoices" && <InvoicesTab />}
              {activeTab === "grades" && <GradesTab />}
              {activeTab === "freeze" && <FreezeTab />}
              {activeTab === "package" && <PackagesTab />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Dashboard Tab Component
function DashboardTab() {
  const stats = [
    { label: "Total Students", value: "1,245", color: "blue", icon: "👨‍🎓" },
    { label: "Present Today", value: "1,198", color: "green", icon: "✅" },
    { label: "Pending Invoices", value: "48", color: "red", icon: "💳" },
    { label: "Frozen Accounts", value: "5", color: "yellow", icon: "❄️" },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className={`bg-${stat.color}-50 border-l-4 border-${stat.color}-500 p-6 rounded-lg`}>
            <div className="text-3xl mb-2">{stat.icon}</div>
            <div className="text-sm text-gray-600">{stat.label}</div>
            <div className="text-3xl font-bold text-gray-800">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Students Tab Component
function StudentsTab() {
  const students = [
    { id: "1", name: "Ahmed Hassan", class: "Year 1", email: "ahmed@school.com", status: "Active" },
    { id: "2", name: "Fatima Ali", class: "Year 2", email: "fatima@school.com", status: "Active" },
    { id: "3", name: "Mohammed Saeed", class: "Year 1", email: "mohammed@school.com", status: "Frozen" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Students List</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
          + Add Student
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Class</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-4 px-4 text-gray-800">{student.name}</td>
                <td className="py-4 px-4 text-gray-600">{student.class}</td>
                <td className="py-4 px-4 text-gray-600">{student.email}</td>
                <td className="py-4 px-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    student.status === "Active" 
                      ? "bg-green-100 text-green-800" 
                      : "bg-red-100 text-red-800"
                  }`}>
                    {student.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm mr-3">View</button>
                  <button className="text-blue-600 hover:text-blue-800 font-semibold text-sm">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Attendance Tab Component
function AttendanceTab() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Attendance Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="text-4xl font-bold text-blue-600 mb-2">92%</div>
          <div className="text-gray-700">Overall Attendance Rate</div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="text-4xl font-bold text-green-600 mb-2">1,198</div>
          <div className="text-gray-700">Present Today</div>
        </div>
        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <div className="text-4xl font-bold text-red-600 mb-2">47</div>
          <div className="text-gray-700">Absent Today</div>
        </div>
      </div>
      <div className="mt-8">
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold">
          Mark Attendance
        </button>
      </div>
    </div>
  );
}

// Enrollment Tab Component
function EnrollmentTab() {
  const enrollments = [
    { id: "1", studentName: "Ahmed Hassan", program: "English Language", enrollDate: "2026-01-15", status: "Enrolled" },
    { id: "2", studentName: "Fatima Ali", program: "Mathematics", enrollDate: "2026-01-20", status: "Enrolled" },
    { id: "3", studentName: "Sara Khan", program: "Science", enrollDate: "2026-02-01", status: "Pending" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Enrollments</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
          + New Enrollment
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Student Name</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Program</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Enrollment Date</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-4 px-4 text-gray-800">{enrollment.studentName}</td>
                <td className="py-4 px-4 text-gray-600">{enrollment.program}</td>
                <td className="py-4 px-4 text-gray-600">{enrollment.enrollDate}</td>
                <td className="py-4 px-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    enrollment.status === "Enrolled" 
                      ? "bg-green-100 text-green-800" 
                      : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {enrollment.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">Confirm</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Invoices Tab Component
function InvoicesTab() {
  const invoices = [
    { id: "INV001", student: "Ahmed Hassan", amount: "RM 2,500", dueDate: "2026-03-31", status: "Paid" },
    { id: "INV002", student: "Fatima Ali", amount: "RM 2,500", dueDate: "2026-03-31", status: "Pending" },
    { id: "INV003", student: "Mohammed Saeed", amount: "RM 2,500", dueDate: "2026-02-28", status: "Overdue" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Invoices</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
          + Create Invoice
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Invoice ID</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Student</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Amount</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Due Date</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-4 px-4 font-semibold text-gray-800">{invoice.id}</td>
                <td className="py-4 px-4 text-gray-600">{invoice.student}</td>
                <td className="py-4 px-4 text-gray-600 font-semibold">{invoice.amount}</td>
                <td className="py-4 px-4 text-gray-600">{invoice.dueDate}</td>
                <td className="py-4 px-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    invoice.status === "Paid" 
                      ? "bg-green-100 text-green-800"
                      : invoice.status === "Pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Grades Tab Component
function GradesTab() {
  const grades = [
    { student: "Ahmed Hassan", subject: "English", grade: "A", percentage: "92%" },
    { student: "Fatima Ali", subject: "Mathematics", grade: "A+", percentage: "95%" },
    { student: "Mohammed Saeed", subject: "Science", grade: "B+", percentage: "88%" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Grades</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
          + Upload Grades
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Student</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Subject</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Grade</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Percentage</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade, idx) => (
              <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-4 px-4 text-gray-800">{grade.student}</td>
                <td className="py-4 px-4 text-gray-600">{grade.subject}</td>
                <td className="py-4 px-4">
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold">{grade.grade}</span>
                </td>
                <td className="py-4 px-4 font-semibold text-gray-800">{grade.percentage}</td>
                <td className="py-4 px-4 text-right">
                  <button className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Freeze Student Tab Component
function FreezeTab() {
  const frozenStudents = [
    { id: "1", name: "Mohammed Saeed", reason: "Payment Default", freezeDate: "2026-02-15", status: "Active" },
    { id: "2", name: "Zainab Ibrahim", reason: "Attendance Below 75%", freezeDate: "2026-01-20", status: "Active" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Frozen Accounts</h2>
        <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold">
          + Freeze Student
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Student Name</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Reason</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Freeze Date</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {frozenStudents.map((student) => (
              <tr key={student.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-4 px-4 text-gray-800 font-semibold">{student.name}</td>
                <td className="py-4 px-4 text-gray-600">{student.reason}</td>
                <td className="py-4 px-4 text-gray-600">{student.freezeDate}</td>
                <td className="py-4 px-4">
                  <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                    {student.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button className="text-green-600 hover:text-green-800 font-semibold text-sm">Unfreeze</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Packages Tab Component
function PackagesTab() {
  const packages = [
    { id: "1", name: "Basic Package", price: "RM 2,500", courses: "5 Courses", duration: "12 Months", status: "Active" },
    { id: "2", name: "Premium Package", price: "RM 4,500", courses: "15 Courses", duration: "12 Months", status: "Active" },
    { id: "3", name: "Elite Package", price: "RM 7,500", courses: "30 Courses", duration: "24 Months", status: "Active" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Packages</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
          + Create Package
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <div key={pkg.id} className="border-2 border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
            <h3 className="text-xl font-bold text-gray-800 mb-3">{pkg.name}</h3>
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Price:</span>
                <span className="font-bold text-indigo-600 text-lg">{pkg.price}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Courses:</span>
                <span className="font-semibold text-gray-800">{pkg.courses}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Duration:</span>
                <span className="font-semibold text-gray-800">{pkg.duration}</span>
              </div>
            </div>
            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors">
              Edit Package
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
