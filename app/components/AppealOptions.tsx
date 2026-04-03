"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SubAccountSwitcher from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";
import { jsPDF } from "jspdf";

interface AppealRequest {
  id: string;
  type: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  letterContent?: string;
}

const appealTypes = [
  {
    id: "warning-letter",
    name: "Warning Letter",
    icon: "⚠️",
    description: "Appeal against a warning letter issued",
  },
  {
    id: "show-cause-letter",
    name: "Show Cause Letter",
    icon: "📋",
    description: "Appeal against a show cause letter",
  },
  {
    id: "pip",
    name: "PIP",
    icon: "📈",
    description: "Appeal against Personal Improvement Plan",
  },
];

export default function AppealOptions() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewingAppeal, setViewingAppeal] = useState<AppealRequest | null>(null);
  const [formData, setFormData] = useState({
    employeeName: "",
    employeeId: "",
    department: "",
    position: "",
    date: "",
    reason: "",
    letterDate: "",
    offense: "",
    responseDeadline: "",
    managerName: "",
    managerTitle: "",
    improvementGoals: "",
    reviewDate: "",
    supportProvided: "",
  });
  const [appeals, setAppeals] = useState<AppealRequest[]>([
    {
      id: "1",
      type: "Warning Letter",
      date: "15/03/26",
      status: "Pending",
      reason: "I believe the warning was issued in error",
      letterContent: `EBRIGHT HOLDINGS SDN BHD
Warning Letter

Date: 15/03/2026

To: John Doe
Employee ID: EMP001
Department: IT
Position: Software Developer

RE: FORMAL WARNING LETTER

Dear John Doe,

This letter serves as a formal warning regarding your conduct/performance at Ebright Holdings SDN BHD.

REASON FOR WARNING:
Late attendance and poor time management

DETAILS OF THE INCIDENT:
Multiple instances of arriving late to work without proper notification or justification.

EXPECTED IMPROVEMENT:
You are expected to rectify this matter immediately and ensure compliance with company policies going forward.

CONSEQUENCES:
Further violations of company policy may result in disciplinary action, up to and including termination of employment.

This warning will remain on your employment record for [12 months] from the date of this letter.

If you wish to appeal this warning, please submit a written appeal within [7 days] of receiving this letter.

Yours faithfully,

Mr. Ahmad
HR Manager
Ebright Holdings SDN BHD`,
    },
    {
      id: "2",
      type: "Show Cause Letter",
      date: "10/03/26",
      status: "Approved",
      reason: "Request for review and reconsideration",
      letterContent: `EBRIGHT HOLDINGS SDN BHD
Show Cause Letter

Date: 10/03/2026

To: Jane Smith
Employee ID: EMP002
Department: Finance
Position: Accountant

RE: SHOW CAUSE NOTICE

Dear Jane Smith,

You are hereby required to show cause why disciplinary action should not be taken against you for the following reason(s):

ALLEGED MISCONDUCT/OFFENSE:
Financial discrepancy and mishandling of company funds

DETAILS:
An audit revealed inconsistencies in expense claims submitted during the month of February 2026.

REQUIRED ACTION:
You are required to submit a written explanation/response to this letter within [7] working days from the date of this letter.

Your response should include:
1. Your account of the incident
2. Any mitigating circumstances
3. Evidence or documents supporting your position
4. Any witnesses who can corroborate your account

SUBMISSION:
Please submit your response to Mr. Ahmad at HR Department.

IMPORTANT:
Failure to respond within the stipulated time may result in disciplinary action being taken without your input.

Yours faithfully,

Mr. Ahmad
HR Manager
Ebright Holdings SDN BHD`,
    },
  ]);

  const generateWarningLetterContent = () => {
    return `EBRIGHT HOLDINGS SDN BHD
Warning Letter

Date: ${formData.letterDate}

To: ${formData.employeeName}
Employee ID: ${formData.employeeId}
Department: ${formData.department}
Position: ${formData.position}

RE: FORMAL WARNING LETTER

Dear ${formData.employeeName},

This letter serves as a formal warning regarding your conduct/performance at Ebright Holdings SDN BHD.

REASON FOR WARNING:
${formData.offense}

DETAILS OF THE INCIDENT:
${formData.reason}

EXPECTED IMPROVEMENT:
You are expected to rectify this matter immediately and ensure compliance with company policies going forward.

CONSEQUENCES:
Further violations of company policy may result in disciplinary action, up to and including termination of employment.

This warning will remain on your employment record for [12 months] from the date of this letter.

If you wish to appeal this warning, please submit a written appeal within [7 days] of receiving this letter.

Yours faithfully,

${formData.managerName}
${formData.managerTitle}
Ebright Holdings SDN BHD`;
  };

  const generateShowCauseLetterContent = () => {
    return `EBRIGHT HOLDINGS SDN BHD
Show Cause Letter

Date: ${formData.letterDate}

To: ${formData.employeeName}
Employee ID: ${formData.employeeId}
Department: ${formData.department}
Position: ${formData.position}

RE: SHOW CAUSE NOTICE

Dear ${formData.employeeName},

You are hereby required to show cause why disciplinary action should not be taken against you for the following reason(s):

ALLEGED MISCONDUCT/OFFENSE:
${formData.offense}

DETAILS:
${formData.reason}

REQUIRED ACTION:
You are required to submit a written explanation/response to this letter within [${formData.responseDeadline}] working days from the date of this letter.

Your response should include:
1. Your account of the incident
2. Any mitigating circumstances
3. Evidence or documents supporting your position
4. Any witnesses who can corroborate your account

SUBMISSION:
Please submit your response to ${formData.managerName} at [HR Department Email/Office].

IMPORTANT:
Failure to respond within the stipulated time may result in disciplinary action being taken without your input.

Yours faithfully,

${formData.managerName}
${formData.managerTitle}
Ebright Holdings SDN BHD`;
  };

  const generatePIPLetterContent = () => {
    return `EBRIGHT HOLDINGS SDN BHD
Personal Improvement Plan (PIP)

Date: ${formData.letterDate}

To: ${formData.employeeName}
Employee ID: ${formData.employeeId}
Department: ${formData.department}
Position: ${formData.position}

RE: PERSONAL IMPROVEMENT PLAN

Dear ${formData.employeeName},

This Personal Improvement Plan (PIP) has been issued to address performance concerns and to provide you with a structured opportunity to meet the expectations required for your role at Ebright Holdings SDN BHD.

AREAS REQUIRING IMPROVEMENT:
${formData.offense}

DETAILS / PERFORMANCE CONCERNS:
${formData.reason}

IMPROVEMENT GOALS & TARGETS:
${formData.improvementGoals}

SUPPORT PROVIDED BY MANAGEMENT:
${formData.supportProvided}

REVIEW DATE:
Your progress will be formally reviewed on: ${formData.reviewDate}

EXPECTATIONS:
You are expected to demonstrate consistent and measurable improvement in the areas identified above by the review date. Failure to meet the targets outlined in this plan may result in further disciplinary action, up to and including termination of employment.

Please acknowledge receipt of this PIP by signing a copy and returning it to your manager. Your signature indicates receipt, not necessarily agreement.

Yours faithfully,

${formData.managerName}
${formData.managerTitle}
Ebright Holdings SDN BHD`;
  };

  const generateLetterContent = () => {
    if (selectedType === "warning-letter") {
      return generateWarningLetterContent();
    } else if (selectedType === "show-cause-letter") {
      return generateShowCauseLetterContent();
    } else if (selectedType === "pip") {
      return generatePIPLetterContent();
    }
    return "";
  };

  // PDF preview URL (blob) for the inline viewer
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Build a jsPDF document from any letter text string
  const buildPDF = useCallback((content: string, title: string): jsPDF => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 20;
    const usableW = pageW - margin * 2;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(30, 64, 175); // blue-800
    doc.rect(0, 0, pageW, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("EBRIGHT HOLDINGS SDN BHD", margin, 12);
    doc.setFontSize(9);
    doc.text(title, pageW - margin, 12, { align: "right" });

    // ── Body text ────────────────────────────────────────────────────────────
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Strip the "EBRIGHT HOLDINGS SDN BHD" first line — already in header
    const bodyText = content.replace(/^EBRIGHT HOLDINGS SDN BHD\n/, "").trimStart();
    const lines = doc.splitTextToSize(bodyText, usableW);

    let y = 28;
    const lineH = 5.5;

    for (const line of lines) {
      if (y + lineH > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      // Bold section headers (ALL CAPS lines ending with :)
      if (/^[A-Z\s\/()&]+:$/.test(line.trim())) {
        doc.setFont("helvetica", "bold");
        doc.text(line, margin, y);
        doc.setFont("helvetica", "normal");
      } else {
        doc.text(line, margin, y);
      }
      y += lineH;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" })} — Ebright Holdings SDN BHD`,
      pageW / 2,
      pageH - 10,
      { align: "center" }
    );

    return doc;
  }, []);

  // Download a PDF for the letter currently in the form
  const downloadPDF = useCallback((content: string, filename: string) => {
    const title = filename.replace(/_/g, " ").replace(".pdf", "");
    const doc = buildPDF(content, title);
    doc.save(filename);
  }, [buildPDF]);

  // Generate a blob URL for the inline <iframe> preview
  const openPDFPreview = useCallback((content: string, title: string) => {
    const doc = buildPDF(content, title);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
  }, [buildPDF]);

  const handleAppealSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedType || !formData.reason || !formData.employeeName) {
      alert("Please fill in all required fields");
      return;
    }

    const selectedTypeObj = appealTypes.find((t) => t.id === selectedType);
    const letterContent = generateLetterContent();

    const newAppeal: AppealRequest = {
      id: String(appeals.length + 1),
      type: selectedTypeObj?.name || "",
      date: new Date().toLocaleDateString("en-GB"),
      status: "Pending",
      reason: formData.reason,
      letterContent: letterContent,
    };

    setAppeals([newAppeal, ...appeals]);
    setFormData({
      employeeName: "",
      employeeId: "",
      department: "",
      position: "",
      date: "",
      reason: "",
      letterDate: "",
      offense: "",
      responseDeadline: "",
      managerName: "",
      managerTitle: "",
      improvementGoals: "",
      reviewDate: "",
      supportProvided: "",
    });
    setSelectedType(null);
    setShowPreview(false);
    alert("Appeal submitted successfully!");
  };

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onCollapse={() => setSidebarOpen(!sidebarOpen)} />
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
          <h1 className="text-3xl font-bold text-blue-800">File an Appeal</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Appeal Types Cards */}
          <div className="lg:col-span-2">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                Appeal Categories
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {appealTypes.map((type) => (
                  <div
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedType === type.id
                        ? "border-blue-600 bg-blue-50 shadow-lg"
                        : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                    }`}
                  >
                    <div className="text-4xl mb-3">{type.icon}</div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">
                      {type.name}
                    </h3>
                    <p className="text-sm text-gray-600">{type.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Appeals History */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">Appeal History</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Reason
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appeals.map((appeal) => (
                      <tr
                        key={appeal.id}
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {appeal.type}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {appeal.date}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">
                          {appeal.reason}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              appeal.status === "Approved"
                                ? "bg-green-100 text-green-800"
                                : appeal.status === "Pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {appeal.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {(appeal.type === "Warning Letter" || appeal.type === "Show Cause Letter" || appeal.type === "PIP") && appeal.letterContent && (
                            <button
                              onClick={() => setViewingAppeal(appeal)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              View Letter
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Appeal Form */}
          <div className="lg:col-span-1">
            {selectedType && (selectedType === "warning-letter" || selectedType === "show-cause-letter" || selectedType === "pip") ? (
              <form onSubmit={handleAppealSubmit} className="bg-white rounded-lg shadow-md p-6 sticky top-8 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Fill Letter Details</h3>

                <div className="space-y-3 text-sm">
                  {/* Common Fields */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Employee Name *
                    </label>
                    <input
                      type="text"
                      value={formData.employeeName}
                      onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Employee ID
                    </label>
                    <input
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      placeholder="e.g., EMP001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="IT, HR, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Position
                    </label>
                    <input
                      type="text"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Job title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Letter Date
                    </label>
                    <input
                      type="date"
                      value={formData.letterDate}
                      onChange={(e) => setFormData({ ...formData, letterDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Offense/Misconduct *
                    </label>
                    <textarea
                      value={formData.offense}
                      onChange={(e) => setFormData({ ...formData, offense: e.target.value })}
                      placeholder="Describe the offense or misconduct"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Details/Incident Description *
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Provide details of the incident"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>

                  {selectedType === "show-cause-letter" && (
                    <div>
                      <label className="block font-medium text-gray-700 mb-1">
                        Response Deadline (days)
                      </label>
                      <input
                        type="number"
                        value={formData.responseDeadline}
                        onChange={(e) => setFormData({ ...formData, responseDeadline: e.target.value })}
                        placeholder="e.g., 7"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {selectedType === "pip" && (
                    <>
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">
                          Improvement Goals & Targets *
                        </label>
                        <textarea
                          value={formData.improvementGoals}
                          onChange={(e) => setFormData({ ...formData, improvementGoals: e.target.value })}
                          placeholder="List specific, measurable goals the employee must achieve"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">
                          Support Provided by Management *
                        </label>
                        <textarea
                          value={formData.supportProvided}
                          onChange={(e) => setFormData({ ...formData, supportProvided: e.target.value })}
                          placeholder="e.g., weekly check-ins, training sessions, mentoring"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">
                          Review Date *
                        </label>
                        <input
                          type="date"
                          value={formData.reviewDate}
                          onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Manager/Supervisor Name
                    </label>
                    <input
                      type="text"
                      value={formData.managerName}
                      onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                      placeholder="Manager name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Manager Title
                    </label>
                    <input
                      type="text"
                      value={formData.managerTitle}
                      onChange={(e) => setFormData({ ...formData, managerTitle: e.target.value })}
                      placeholder="e.g., HR Manager"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      const title =
                        selectedType === "warning-letter" ? "Warning Letter"
                        : selectedType === "show-cause-letter" ? "Show Cause Letter"
                        : "Personal Improvement Plan";
                      openPDFPreview(generateLetterContent(), title);
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Preview PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const filename =
                        selectedType === "warning-letter" ? "Warning_Letter.pdf"
                        : selectedType === "show-cause-letter" ? "Show_Cause_Letter.pdf"
                        : "PIP_Letter.pdf";
                      downloadPDF(generateLetterContent(), filename);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Download PDF
                  </button>
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Submit Appeal
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAppealSubmit} className="bg-white rounded-lg shadow-md p-6 sticky top-8">
                <h3 className="text-lg font-bold text-gray-800 mb-6">Submit Appeal</h3>

                <div className="space-y-5">
                  {/* Selected Type Display */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Appeal Type
                    </label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <p className="text-gray-800 font-medium">
                        {selectedType
                          ? appealTypes.find((t) => t.id === selectedType)?.name
                          : "Select a type above"}
                      </p>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Appeal
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      placeholder="Explain your reason for filing this appeal..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={6}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={!selectedType}
                  >
                    Submit Appeal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* PDF Preview Modal (from form Preview button) */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col" style={{ height: "90vh" }}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-gray-800">Letter Preview</h2>
              <button
                onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <iframe
              src={pdfPreviewUrl}
              className="flex-1 w-full rounded-b-lg"
              title="Letter Preview"
            />
          </div>
        </div>
      )}

      {/* View Letter Modal (from Appeal History) */}
      {viewingAppeal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col" style={{ height: "90vh" }}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-gray-800">{viewingAppeal.type}</h2>
              <button
                onClick={() => setViewingAppeal(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <iframe
              src={(() => {
                const doc = buildPDF(viewingAppeal.letterContent || "", viewingAppeal.type);
                return doc.output("bloburl") as unknown as string;
              })()}
              className="flex-1 w-full"
              title={viewingAppeal.type}
            />
            <div className="p-4 border-t border-gray-200 flex gap-3 shrink-0">
              <button
                onClick={() => downloadPDF(
                  viewingAppeal.letterContent || "",
                  `${viewingAppeal.type.replace(/\s+/g, "_")}_${viewingAppeal.date}.pdf`
                )}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Download PDF
              </button>
              <button
                onClick={() => setViewingAppeal(null)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}