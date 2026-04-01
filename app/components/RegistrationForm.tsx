"use client";

import { useState } from "react";
import { BRANCH_OPTIONS, ROLE_OPTIONS, CONTRACT_OPTIONS, GENDER_OPTIONS } from "@/lib/constants";

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
    role: "HUMAN_RESOURCES",
    contract: "12 MONTH",
    startDate: "",
    endDate: "",
    probation: "",
    rate: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!isValidEmail(formData.email)) newErrors.email = "Invalid email format";
    if (!formData.phone.trim()) newErrors.phone = "Phone is required";
    if (!isValidPhone(formData.phone)) newErrors.phone = "Invalid phone format";

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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to register employee");
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
        role: "HUMAN_RESOURCES",
        contract: "12 MONTH",
        startDate: "",
        endDate: "",
        probation: "",
        rate: "",
      });

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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nick Name
            </label>
            <input
              type="text"
              name="nickName"
              value={formData.nickName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter nick name"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.phone ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="Enter phone number"
              disabled={submitting || isLoading}
            />
            {errors.phone && (
              <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
            )}
          </div>

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch
            </label>
            <select
              name="branch"
              value={formData.branch}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            >
              {BRANCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contract */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract
            </label>
            <select
              name="contract"
              value={formData.contract}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            >
              {CONTRACT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Probation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Probation
            </label>
            <input
              type="date"
              name="probation"
              value={formData.probation}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate
            </label>
            <input
              type="number"
              name="rate"
              value={formData.rate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter rate"
              disabled={submitting || isLoading}
            />
          </div>

          {/* NRIC */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NRIC
            </label>
            <input
              type="text"
              name="nric"
              value={formData.nric}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter NRIC"
              disabled={submitting || isLoading}
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            />
          </div>

          {/* Home Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Home Address
            </label>
            <input
              type="text"
              name="homeAddress"
              value={formData.homeAddress}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter home address"
              disabled={submitting || isLoading}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              name="endDate"
              value={formData.endDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={submitting || isLoading}
            />
          </div>

          {/* University */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              University
            </label>
            <input
              type="text"
              name="University"
              value={formData.University}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter university"
              disabled={submitting || isLoading}
            />
          </div>
        </div>

        {/* Employment Details */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Employment Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hire Date
              </label>
              <input
                type="date"
                name="Emp_Hire_Date"
                value={formData.Emp_Hire_Date}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Signed Date
              </label>
              <input
                type="date"
                name="Signed_Date"
                value={formData.Signed_Date}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Type
              </label>
              <input
                type="text"
                name="Emp_Type"
                value={formData.Emp_Type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Full-Time"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Status
              </label>
              <input
                type="text"
                name="Emp_Status"
                value={formData.Emp_Status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Active"
                disabled={submitting || isLoading}
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Emergency Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emergency Contact Number
              </label>
              <input
                type="tel"
                name="Emc_Number"
                value={formData.Emc_Number}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter emergency contact number"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emergency Contact Email
              </label>
              <input
                type="email"
                name="Emc_Email"
                value={formData.Emc_Email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter emergency contact email"
                disabled={submitting || isLoading}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relationship
              </label>
              <input
                type="text"
                name="Emc_Relationship"
                value={formData.Emc_Relationship}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Spouse, Parent"
                disabled={submitting || isLoading}
              />
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Bank Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank
              </label>
              <input
                type="text"
                name="Bank"
                value={formData.Bank}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Maybank"
                disabled={submitting || isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Account Name
              </label>
              <input
                type="text"
                name="Bank_Name"
                value={formData.Bank_Name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter account name"
                disabled={submitting || isLoading}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Account Number
              </label>
              <input
                type="text"
                name="Bank_Account"
                value={formData.Bank_Account}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
