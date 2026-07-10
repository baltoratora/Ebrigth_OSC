"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  parsePrintParams,
  buildPrintApiUrl,
  filterEmployeesForPrint,
  sortAndGroupByBranch,
  type PrintEmployee,
  type PrintParams,
} from "@/lib/printEmployees";
import { getBranchLabel, getRoleLabel } from "@/lib/constants";

type LoadState = "loading" | "ready" | "error" | "empty";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function FilterSummary({ params }: { params: PrintParams }) {
  if (params.all) return <p className="text-sm text-gray-700">Filters: All employees</p>;
  const parts: string[] = [];
  if (params.branch) parts.push(`Branch = ${getBranchLabel(params.branch)}`);
  if (params.role) parts.push(`Role = ${getRoleLabel(params.role)}`);
  if (params.status) parts.push(`Status = ${params.status}`);
  if (params.search) parts.push(`Search = "${params.search}"`);
  return (
    <p className="text-sm text-gray-700">
      Filters: {parts.length === 0 ? "None" : parts.join(", ")}
    </p>
  );
}

function PrintEmployeeListContent() {
  const [employees, setEmployees] = useState<PrintEmployee[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const rawSearchParams = useSearchParams();
  const params: PrintParams = useMemo(
    () => parsePrintParams(new URLSearchParams(rawSearchParams?.toString() ?? "")),
    [rawSearchParams]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildPrintApiUrl(params));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error("unexpected response shape");
        if (cancelled) return;
        const filtered = filterEmployeesForPrint(data as PrintEmployee[], params.status);
        setEmployees(filtered);
        setState(filtered.length === 0 ? "empty" : "ready");
      } catch (err) {
        console.error("print: failed to load employees", err);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (state === "ready") {
      const t = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  const groups = useMemo(() => sortAndGroupByBranch(employees), [employees]);

  return (
    <div className="bg-white text-gray-900 p-8 max-w-5xl mx-auto">
      <style jsx global>{`
        @page { margin: 1.5cm; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr, .branch-group { break-inside: avoid; }
        }
      `}</style>

      <header className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">Ebright — Employee List</h1>
        <p className="text-sm text-gray-700">Generated: {todayIso()}</p>
        <FilterSummary params={params} />
        {state === "ready" && (
          <p className="text-sm text-gray-700">Total: {employees.length} employees</p>
        )}
      </header>

      {state === "loading" && <p className="text-gray-600">Loading employees…</p>}

      {state === "error" && (
        <div className="text-red-700">
          <p>Failed to load employees. Close this tab and try again.</p>
          <button
            onClick={() => window.close()}
            className="no-print mt-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            Close window
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="text-gray-700">
          <p>No employees match these filters.</p>
          <button
            onClick={() => window.close()}
            className="no-print mt-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            Close window
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          <div className="no-print mb-4 flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Print again
            </button>
            <button
              onClick={() => window.close()}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
            >
              Close window
            </button>
          </div>

          {groups.map((g) => (
            <section key={g.branch || "_unknown"} className="branch-group mb-6">
              <h2 className="text-lg font-semibold border-b pb-1 mb-2">
                {getBranchLabel(g.branch) || "(No branch)"}{" "}
                <span className="text-sm font-normal text-gray-600">
                  ({g.employees.length})
                </span>
              </h2>
              <table className="w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-2/5">Name</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Branch</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Status</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {g.employees.map((e) => (
                    <tr key={e.id} className="border-b border-gray-200">
                      <td className="px-2 py-1">{e.fullName || "—"}</td>
                      <td className="px-2 py-1">{getBranchLabel(e.branch) || "—"}</td>
                      <td className="px-2 py-1">
                        {e.accessStatus === "ARCHIVED" ? "Archived" : e.Emp_Status || "—"}
                      </td>
                      <td className="px-2 py-1">{getRoleLabel(e.role) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export default function PrintEmployeeListPage() {
  return (
    <Suspense fallback={<p className="p-8 text-gray-600">Loading…</p>}>
      <PrintEmployeeListContent />
    </Suspense>
  );
}
