"use client";

import { useState, useRef, useEffect } from "react";
import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS, ROLE_OPTIONS, CONTRACT_OPTIONS, GENDER_OPTIONS } from "@/lib/constants";
import EmployeeIdInput from "@/app/components/EmployeeIdInput";
import { composeEmployeeId, isValidSuffix } from "@/lib/employeeId";

// Department applies only to HQ staff; Rate only to part-time coaches (paid
// hourly). Both fields are conditionally shown based on these checks.
const isPartTimeCoach = (role?: string | null) => {
  const r = (role ?? "").trim().toUpperCase();
  return r === "PT COACH" || r.startsWith("PT - COACH");
};

interface RegistrationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export default function RegistrationForm({
  onSuccess,
  onCancel,
  isLoading = false,
}: RegistrationFormProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    gender: "MALE",
    nickName: "",
    email: "",
    phone: "",
    nric: "",
    dob: "",
    homeAddress: "",
    Emc_Number: "",
    Emc_Email: "",
    Emc_Relationship: "",
    Signed_Date: "",
    Emp_Hire_Date: "",
    Emp_Type: "",
    Emp_Status: "",
    Bank: "",
    Bank_Name: "",
    Bank_Account: "",
    University: "",
    branch: "HQ",
    department: "",
    role: "",
    contract: "",
    startDate: "",
    endDate: "",
    probation: "",
    rate: "",
  });

  const [empIdPrefix, setEmpIdPrefix] = useState("");
  const [empIdSuffix, setEmpIdSuffix] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleOpen(false);
        setRoleSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredRoles = ROLE_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(roleSearch.toLowerCase())
  );

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!isValidEmail(formData.email)) newErrors.email = "Invalid email format";
    if (!formData.phone.trim()) newErrors.phone = "Phone is required";
    if (!isValidPhone(formData.phone)) newErrors.phone = "Invalid phone format";

    // Employee ID is optional, but if a prefix is picked, the suffix must be valid
    if (empIdPrefix && !isValidSuffix(empIdSuffix)) {
      newErrors.employeeId = "Enter exactly 6 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidPhone = (phone: string) => {
    return /^[0-9\s\-\+\(\)]{10,}$/.test(phone);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const uppercaseFields = ["fullName", "nickName", "homeAddress"];
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: uppercaseFields.includes(name) ? value.toUpperCase() : value,
      };
      // Department only applies to HQ — clear it when switching to any other branch.
      if (name === "branch" && value !== "HQ") next.department = "";
      return next;
    });
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          empIdPrefix && isValidSuffix(empIdSuffix)
            ? { ...formData, employeeId: composeEmployeeId(empIdPrefix, empIdSuffix) }
            : formData
        ),
      });

      if (!response.ok) {
        const errBody = await response.json();
        if (response.status === 409 && errBody.error?.toLowerCase().includes('employee id')) {
          setErrors((prev) => ({ ...prev, employeeId: errBody.error }));
          setSubmitting(false);
          return;
        }
        throw new Error(errBody.error || "Failed to register employee");
      }

      const data = await response.json();
      const employeeId = data.data?.employeeId || "Generated";

      // Reset form
      setFormData({
        fullName: "",
        gender: "MALE",
        nickName: "",
        email: "",
        phone: "",
        nric: "",
        dob: "",
        homeAddress: "",
        Emc_Number: "",
        Emc_Email: "",
        Emc_Relationship: "",
        Signed_Date: "",
        Emp_Hire_Date: "",
        Emp_Type: "",
        Emp_Status: "",
        Bank: "",
        Bank_Name: "",
        Bank_Account: "",
        University: "",
        branch: "HQ",
        department: "",
        role: "",
        contract: "",
        startDate: "",
        endDate: "",
        probation: "",
        rate: "",
      });

      setEmpIdPrefix("");
      setEmpIdSuffix("");

      // Show success message with employee ID
      setSuccessMessage(`✓ Employee registered successfully! Employee ID: ${employeeId}`);
      setTimeout(() => {
        setSuccessMessage(null);
        onSuccess?.();
      }, 3000);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add User</h2>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 uppercase ${
                errors.fullName ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="Enter full name"
              disabled={submitting || isLoading}
            />
            {errors.fullName && (
              <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>
            )}
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Gender
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              disabled={submitting || isLoading}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nick Name */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Nick Name
            </label>
            <input
              type="text"
              name="nickName"
              value={formData.nickName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 uppercase"
              placeholder="Enter nick name"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="Enter email address"
              disabled={submitting || isLoading}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${
                errors.phone ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="Enter phone number"
              disabled={submitting || isLoading}
            />
            {errors.phone && (
              <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
            )}
          </div>


          {/* NRIC */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              NRIC
            </label>
            <input
              type="text"
              name="nric"
              value={formData.nric}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              placeholder="Enter NRIC"
              disabled={submitting || isLoading}
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Home Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Home Address
            </label>
            <input
              type="text"
              name="homeAddress"
              value={formData.homeAddress}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 uppercase"
              placeholder="Enter home address"
              disabled={submitting || isLoading}
            />
          </div>


          {/* University */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              University
            </label>
            <input
              type="text"
              name="University"
              value={formData.University}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              placeholder="Enter university"
              disabled={submitting || isLoading}
            />
          </div>
        </div>

        {/* Employment Details */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Employment Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <EmployeeIdInput
                prefix={empIdPrefix}
                suffix={empIdSuffix}
                onPrefixChange={(v) => { setEmpIdPrefix(v); if (errors.employeeId) setErrors((p) => ({ ...p, employeeId: "" })); }}
                onSuffixChange={(v) => { setEmpIdSuffix(v); if (errors.employeeId) setErrors((p) => ({ ...p, employeeId: "" })); }}
                error={errors.employeeId}
                disabled={submitting || isLoading}
                required={false}
              />
            </div>

            {/* Branch */}
            <div className={formData.branch === "HQ" ? "" : "md:col-span-2"}>
              <label className="block text-sm font-medium text-gray-900 mb-1">Branch</label>
              <select
                name="branch"
                value={formData.branch}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              >
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Department — only relevant for HQ staff */}
            {formData.branch === "HQ" && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Department</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  disabled={submitting || isLoading}
                >
                  {DEPARTMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Role */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">Role</label>
              <div ref={roleRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setRoleOpen((v) => !v); setRoleSearch(""); }}
                  disabled={submitting || isLoading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-left text-sm text-gray-900 bg-white flex justify-between items-center disabled:bg-gray-100"
                >
                  <span className="text-gray-900">{formData.role || "Select role"}</span>
                  <span className="text-gray-400">▾</span>
                </button>
                {roleOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b">
                      <input
                        type="text"
                        placeholder="Search role..."
                        value={roleSearch}
                        onChange={(e) => setRoleSearch(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    <ul className="max-h-52 overflow-y-auto">
                      {filteredRoles.length === 0 ? (
                        <li className="px-4 py-2 text-sm text-gray-400">No roles found</li>
                      ) : (
                        filteredRoles.map((o) => (
                          <li
                            key={o.value}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                role: o.value,
                                // Rate only applies to part-time coaches; drop any stale value otherwise.
                                rate: isPartTimeCoach(o.value) ? prev.rate : "",
                              }));
                              setRoleOpen(false);
                              setRoleSearch("");
                            }}
                            className={`px-4 py-2 text-sm cursor-pointer text-gray-900 hover:bg-blue-50 ${formData.role === o.value ? "bg-blue-100 font-medium" : ""}`}
                          >
                            {o.label}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Contract */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Contract</label>
              <select
                name="contract"
                value={formData.contract}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              >
                {CONTRACT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Start Date</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              />
            </div>

            {/* Probation */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Probation</label>
              <input
                type="date"
                name="probation"
                value={formData.probation}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">End Date</label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              />
            </div>

            {/* Rate — only for part-time coaches (paid hourly) */}
            {isPartTimeCoach(formData.role) && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Rate</label>
                <input
                  type="number"
                  name="rate"
                  value={formData.rate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="Enter rate"
                  disabled={submitting || isLoading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Hire Date
              </label>
              <input
                type="date"
                name="Emp_Hire_Date"
                value={formData.Emp_Hire_Date}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Signed Date
              </label>
              <input
                type="date"
                name="Signed_Date"
                value={formData.Signed_Date}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Employee Type
              </label>
              <input
                type="text"
                name="Emp_Type"
                value={formData.Emp_Type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g. Full-Time"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Employee Status
              </label>
              <select
                name="Emp_Status"
                value={formData.Emp_Status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={submitting || isLoading}
              >
                <option value="">-- Select Status --</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Emergency Contact Number
              </label>
              <input
                type="tel"
                name="Emc_Number"
                value={formData.Emc_Number}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Enter emergency contact number"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Emergency Contact Name
              </label>
              <input
                type="text"
                name="Emc_Email"
                value={formData.Emc_Email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Enter emergency contact name"
                disabled={submitting || isLoading}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Relationship
              </label>
              <input
                type="text"
                name="Emc_Relationship"
                value={formData.Emc_Relationship}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g. Spouse, Parent"
                disabled={submitting || isLoading}
              />
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Bank Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Bank
              </label>
              <input
                type="text"
                name="Bank"
                value={formData.Bank}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g. Maybank"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Bank Account Name
              </label>
              <input
                type="text"
                name="Bank_Name"
                value={formData.Bank_Name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Enter account name"
                disabled={submitting || isLoading}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Bank Account Number
              </label>
              <input
                type="text"
                name="Bank_Account"
                value={formData.Bank_Account}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Enter account number"
                disabled={submitting || isLoading}
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={submitting || isLoading}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {submitting ? "Registering..." : "Register Employee"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting || isLoading}
            className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
