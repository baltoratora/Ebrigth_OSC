"use client";

import { useState, useRef } from "react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";
import Link from "next/link";

// --- SUB-COMPONENT: CLAIM FORM ---
interface ClaimFormProps {
  claim: { id: string; title: string; icon: string; color: string; hex: string };
  onBack: () => void;
}

const ClaimForm = ({ claim, onBack }: ClaimFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="bg-white rounded-3xl shadow-2xl p-12 text-center max-w-md w-full border border-gray-100 animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl shadow-inner border border-green-100">
            ✓
          </div>
          <h2 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">Success!</h2>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Your <strong>{claim.title}</strong> has been logged. Our finance team will review it within 3-5 business days.
          </p>
          <button 
            onClick={onBack}
            className="w-full bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100">
        {/* Header Section */}
        <div className={`relative p-10 text-white ${claim.color}`}>
            <div className="absolute top-0 right-0 p-8 opacity-10 text-9xl pointer-events-none uppercase font-black">
                {claim.id}
            </div>
            <div className="relative flex justify-between items-start">
                <div className="flex items-center gap-6">
                    <span className="text-5xl bg-white/20 backdrop-blur-md p-4 rounded-2xl shadow-inner">{claim.icon}</span>
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">{claim.title}</h2>
                        <p className="text-white/80 font-medium">New Application</p>
                    </div>
                </div>
                <button onClick={onBack} className="bg-black/10 hover:bg-black/20 p-2 rounded-full transition-colors text-white">
                    ✕
                </button>
            </div>
        </div>

        <form className="p-10 space-y-8" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">Claim Date</label>
              <input required type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">Total Amount</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
                <input required type="number" step="0.01" className="w-full pl-10 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-slate-700" placeholder="0.00" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">Description</label>
            <textarea required rows={3} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none" placeholder="Provide full context here..."></textarea>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">Supporting Documents</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`group border-2 border-dashed rounded-[1.5rem] p-10 text-center transition-all cursor-pointer flex flex-col items-center
                ${selectedFile ? 'border-green-400 bg-green-50/30' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
            >
              <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              {selectedFile ? (
                <div className="flex flex-col items-center">
                    <span className="text-3xl mb-2">📄</span>
                    <p className="text-green-700 font-bold">{selectedFile.name}</p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs text-red-500 mt-2 font-bold hover:underline">Change File</button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                    <span className="text-3xl mb-3 opacity-40 group-hover:scale-110 transition-transform">☁️</span>
                    <p className="text-slate-500 font-medium">Click to upload <span className="text-blue-600 font-bold">Receipt or MC</span></p>
                    <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-tighter">PDF, JPG or PNG (MAX 5MB)</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-6">
            <button type="button" onClick={onBack} className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors">Cancel</button>
            <button type="submit" className={`flex-1 py-4 ${claim.color} text-white rounded-2xl font-bold shadow-xl shadow-blue-900/10 hover:brightness-110 active:scale-[0.98] transition-all`}>
              Complete Submission
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN PAGE ---
const CLAIM_TYPES = [
  { id: "sales", title: "Sales Claim", icon: "📈", color: "bg-gradient-to-br from-blue-500 to-blue-700", hex: "#2563eb" },
  { id: "health", title: "Health Claim", icon: "🏥", color: "bg-gradient-to-br from-emerald-500 to-emerald-700", hex: "#059669" },
  { id: "transport", title: "Transport", icon: "🚗", color: "bg-gradient-to-br from-orange-400 to-orange-600", hex: "#ea580c" },
  { id: "mc", title: "Medical Leave", icon: "🤒", color: "bg-gradient-to-br from-indigo-500 to-indigo-700", hex: "#4f46e5" },
];

export default function ClaimsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<typeof CLAIM_TYPES[0] | null>(null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Dynamic Header */}
      <header className="bg-slate-900 text-white shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        <div className="relative flex justify-between items-center px-10 py-10">
          <div>
            <h1 className="text-4xl font-black tracking-tight uppercase">Claims <span className="text-blue-500">Hub</span></h1>
            <p className="text-slate-400 font-medium text-sm tracking-widest mt-1">EBRIGHT FINANCE PORTAL</p>
          </div>
          <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-12 py-12 bg-[#F8FAFC]">
          <div className="mx-auto w-full max-w-6xl">
            {selectedClaim ? (
              <ClaimForm claim={selectedClaim} onBack={() => setSelectedClaim(null)} />
            ) : (
              <div className="animate-in fade-in duration-700">
                <div className="flex items-end justify-between mb-12">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">What are we filing today?</h2>
                    <p className="text-slate-500 text-lg font-medium italic">Select your claim category to begin the workflow.</p>
                  </div>
                  <Link href="/dashboard-employee-management" className="px-6 py-3 rounded-2xl bg-white shadow-sm border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                    ← <span className="mb-0.5">Dashboard</span>
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {CLAIM_TYPES.map((claim) => (
                    <div 
                      key={claim.id} 
                      onClick={() => setSelectedClaim(claim)}
                      className="cursor-pointer group relative"
                    >
                      <div className="h-full bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 transition-all duration-500 hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-3 flex flex-col items-center text-center">
                        <div className={`w-20 h-20 rounded-2xl ${claim.color} flex items-center justify-center text-4xl shadow-lg mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                           {claim.icon}
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">{claim.title}</h3>
                        <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">Process your {claim.id} reimbursements instantly.</p>
                        
                        <div className="mt-auto flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                          Create Request →
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Info Card */}
                <div className="mt-16 bg-blue-600 rounded-[2rem] p-10 text-white flex flex-col md:flex-row items-center justify-between shadow-2xl shadow-blue-900/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="relative z-10">
                        <h3 className="text-2xl font-black mb-2 tracking-tight">Need help with claims?</h3>
                        <p className="text-blue-100 font-medium">Download the <span className="underline decoration-2 underline-offset-4">Employee Reimbursement Guide (2026)</span></p>
                    </div>
                    <button className="relative z-10 mt-6 md:mt-0 px-8 py-4 bg-white text-blue-600 font-black rounded-2xl hover:bg-blue-50 transition-all active:scale-95 shadow-xl">
                        View Guidelines
                    </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}