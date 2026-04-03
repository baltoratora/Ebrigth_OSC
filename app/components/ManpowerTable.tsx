"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";

const COLUMNS = [
  { id: "coach1", label: "Coach 1", type: "coach" as const, employees: ["Iqbal", "Ying Chen"] },
  { id: "coach2", label: "Coach 2", type: "coach" as const, employees: ["Adam", "Faiq"] },
  { id: "coach3", label: "Coach 3", type: "coach" as const, employees: ["Ashwin", "Salman"] },
  { id: "exec1", label: "Executive 1", type: "executive" as const, employees: ["Li Yi", "Dina"] },
  { id: "exec2", label: "Executive 2", type: "executive" as const, employees: ["Sharukh", "Ferris"] },
  { id: "exec3", label: "Executive 3", type: "executive" as const, employees: ["Faiz", "Danis"] },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const WEEKDAY_TIME_SLOTS = [
  "06:00 PM – 07:15 PM",
  "07:15 PM – 08:30 PM",
] as const;

const WEEKEND_TIME_SLOTS = [
  "08:45 AM – 09:15 AM", // Opening admin slot
  "09:15 AM – 10:30 AM",
  "10:30 AM – 11:45 AM",
  "11:45 AM – 12:00 PM", // Rest
  "12:00 PM – 1:15 PM",
  "1:15 PM – 2:30 PM",
  "2:30 PM – 2:45 PM", // Rest
  "2:45 PM – 4:00 PM",
  "4:00 PM – 5:15 PM",
  "5:15 PM – 5:30 PM", // Rest
  "5:30 PM – 6:45 PM",
  "6:45 PM – 7:15 PM", // Closing admin slot
] as const;

const WEEKDAY_DAYS = ["Wednesday", "Thursday", "Friday"] as const;

function getTimeSlotsForDay(day: string): readonly string[] {
  return WEEKDAY_DAYS.includes(day as (typeof WEEKDAY_DAYS)[number])
    ? WEEKDAY_TIME_SLOTS
    : WEEKEND_TIME_SLOTS;
}

const SELECT_ARROW_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235f6368' d='M6 8L1 3h10z'/%3E%3C/svg%3E";

function isAdminSlot(slot: string) {
  return [
    "08:45 AM – 09:15 AM",
    "11:45 AM – 12:00 PM",
    "2:30 PM – 2:45 PM",
    "5:15 PM – 5:30 PM",
    "6:45 PM – 7:15 PM",
  ].includes(slot);
}

function getSlotWeight(day: string, slot: string): number {
  if (WEEKDAY_DAYS.includes(day as (typeof WEEKDAY_DAYS)[number])) {
    return 2.5; 
  }

  if (["08:45 AM – 09:15 AM", "6:45 PM – 7:15 PM"].includes(slot)) {
    return 0.5;
  }
  if ([
    "11:45 AM – 12:00 PM",
    "2:30 PM – 2:45 PM",
    "5:15 PM – 5:30 PM",
  ].includes(slot)) {
    return 0.25;
  }
  return 1.25;
}

// --- NEW INTERFACE ADDED HERE ---
interface ManpowerTableProps {
  week: string;
}

// --- UPDATED FUNCTION SIGNATURE ---
export default function ManpowerTable({ week }: ManpowerTableProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>({
    Wednesday: true,
    Thursday: true,
    Friday: true,
    Saturday: true,
    Sunday: true,
  });
  const [showRestRows, setShowRestRows] = useState(false);

  const handleSelect = (
    day: string,
    time: string,
    columnId: ColumnId,
    employeeName: string,
  ) => {
    const key = `${day}-${time}-${columnId}`;
    setSelections((prev) => ({
      ...prev,
      [key]: employeeName,
    }));
  };

  const handleNoteChange = (day: string, time: string, value: string) => {
    const key = `${day}-${time}-notes`;
    setNotes((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleBulkUpdate = (day: string, columnId: ColumnId, checked: boolean) => {
    const column = COLUMNS.find((col) => col.id === columnId);
    if (!column) return;
    
    const slots = getTimeSlotsForDay(day);

    setSelections((prev) => {
      const newSelections = { ...prev };

      slots.forEach((slot) => {
        const key = `${day}-${slot}-${columnId}`;
        if (checked && column.employees.length > 0) {
          newSelections[key] = column.employees[0];
        } else {
          delete newSelections[key];
        }
      });

      return newSelections;
    });
  };

  const handleSaveDay = async (day: string) => {
    try {
      const res = await fetch("/api/save-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day,
          selections,
          notes,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }

      window.alert(data?.message ?? `Successfully saved ${day} schedule!`);
      setEditingDays((prev) => ({ ...prev, [day]: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      window.alert(`Failed to save ${day}: ${message}`);
    }
  };

  const calculateStaffHours = (daysFilter: readonly string[] = DAYS) => {
    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number; assignedSlots: number }> = {};

    // Initialize all employees
    COLUMNS.forEach((col) => {
      col.employees.forEach((emp) => {
        if (!staffStats[emp]) {
          staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0, assignedSlots: 0 };
        }
      });
    });

    daysFilter.forEach((day) => {
      const slots = getTimeSlotsForDay(day);

      slots.forEach((slot) => {
        const weight = getSlotWeight(day, slot);

        COLUMNS.forEach((col) => {
          const key = `${day}-${slot}-${col.id}`;
          const employeeName = selections[key];

          if (employeeName) {
            if (!staffStats[employeeName]) {
              staffStats[employeeName] = { coachHrs: 0, execHrs: 0, total: 0, assignedSlots: 0 };
            }
            staffStats[employeeName].assignedSlots += 1;
            staffStats[employeeName].total += weight;

            if (col.type === "coach") {
              staffStats[employeeName].coachHrs += weight;
            } else {
              staffStats[employeeName].execHrs += weight;
            }
          }
        });
      });
    });

    return Object.entries(staffStats).map(([name, stats]) => ({
      name,
      ...stats,
    }));
  };

  const staffHoursSummary = calculateStaffHours();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="px-4 py-6">
          <h1 className="text-3xl font-bold">HR Attendance System</h1>
          <p className="text-blue-100 mt-1">Super Admin Dashboard</p>
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gradient-to-br from-[#f0f4f8] to-[#d2dce9] text-[#1a1d23] [font-family:Segoe_UI,system-ui,-apple-system,sans-serif]">
          {/* Displaying the selected week at the top of the main content */}
          <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-blue-200">
             <span className="font-bold text-blue-800">Selected Schedule:</span> {week.replace('start=', '').replace('&end=', ' to ')}
          </div>

          {DAYS.map((day) => {
            const isEditing = !!editingDays[day];

            const accentBorderClasses =
              day === "Wednesday"
                ? "border-t-4 border-t-[#1a73e8]"
                : day === "Thursday"
                  ? "border-t-4 border-t-[#7b5cff]"
                  : day === "Friday"
                    ? "border-t-4 border-t-[#f472b6]"
                    : day === "Saturday"
                      ? "border-t-4 border-t-[#14b8a6]"
                      : "border-t-4 border-t-[#f59e0b]";

            return (
            <div
              key={day}
              className={`mx-auto mb-8 w-full max-w-[95%] overflow-hidden rounded-[15px] border border-[#e0e2e6]/70 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-sm last:mb-0 ${accentBorderClasses}`}
            >
              <header className="border-b border-[#e8eaed] bg-white px-8 py-6">
                <h1 className="m-0 text-[1.5rem] font-semibold text-[#1a1d23]">
                  {day}
                </h1>
                <p className="m-0 mt-1 text-[0.9rem] text-[#5f6368]">
                  Manpower planning for the week of {week.split('&')[0].split('=')[1] || 'N/A'}
                </p>
              </header>

              <div className="flex items-center justify-between mb-2 px-8 py-4">
                <button
                  type="button"
                  onClick={() => setShowRestRows((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-[6px] bg-[#1a73e8] px-3 py-1 text-[0.825rem] font-medium text-white hover:bg-[#1669d4]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {showRestRows ? 'Hide Rest Times' : 'Show Rest Times'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1550px] table-auto border-separate border-spacing-0 text-[0.9rem]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[250px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-6 py-4 text-left font-semibold text-white whitespace-nowrap align-middle">
                        Time slot
                      </th>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.id}
                          className="relative min-w-[200px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-3 py-[0.6rem] text-center font-semibold text-white whitespace-nowrap"
                        >
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="form-checkbox h-4 w-4 text-teal-500 bg-white border-gray-300 rounded focus:ring-0"
                              onChange={(e) => handleBulkUpdate(day, col.id, e.target.checked)}
                            />
                            <span className="sr-only">Select all for {col.label}</span>
                          </label>
                          <span className="block mt-1">{col.label}</span>
                          <span className="block text-[0.7rem] text-blue-200">
                            ({col.type === "coach" ? "Coach" : "Executive"})
                          </span>
                        </th>
                      ))}
                      <th className="min-w-[200px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-3 py-[0.6rem] text-left font-semibold text-white whitespace-nowrap">
                        Notes / Remarks
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {getTimeSlotsForDay(day)
                      .filter((slot) => {
                        if (isAdminSlot(slot) && !showRestRows) return false;
                        return true;
                      })
                      .map((slot) => (
                        <tr
                          key={slot}
                          className={`even:bg-[#f7f9fc] hover:bg-[#edf2fb] ${isAdminSlot(slot) ? 'bg-gray-100/80' : ''}`}
                        >
                        <td className="sticky left-0 z-10 border border-[#e0e2e6] bg-blue-50/50 px-6 py-4 align-middle font-semibold text-[#1a3a5f] whitespace-nowrap">
                          {slot}
                        </td>

                        {COLUMNS.map((col) => {
                          const selectionKey = `${day}-${slot}-${col.id}`;
                          const selectedEmployee = selections[selectionKey] || "";

                          const baseSelectClasses =
                            "w-full min-w-0 appearance-none rounded-[6px] border bg-no-repeat px-[0.6rem] py-[0.45rem] pr-7 text-[0.875rem] text-center transition-colors duration-200 focus:outline-none disabled:opacity-100 disabled:cursor-not-allowed";

                          const roleClasses = selectedEmployee
                            ? col.type === "coach"
                              ? "bg-green-100 text-green-800 border-green-300 shadow-sm"
                              : "bg-blue-100 text-blue-800 border-blue-300 shadow-sm"
                            : "bg-gray-50 text-gray-400 border-gray-200";

                          return (
                            <td
                              key={col.id}
                              className="min-w-[200px] border border-[#e0e2e6] px-6 py-4 align-middle text-center"
                            >
                              <select
                                disabled={!isEditing}
                                value={selectedEmployee}
                                onChange={(e) =>
                                  handleSelect(
                                    day,
                                    slot,
                                    col.id,
                                    e.target.value,
                                  )
                                }
                                className={`${baseSelectClasses} ${roleClasses}`}
                                style={{
                                  backgroundImage: `url("${SELECT_ARROW_DATA_URI}")`,
                                  backgroundPosition: "right 0.5rem center",
                                }}
                              >
                                <option className="text-center" value="">
                                    None 
                                </option>
                                {col.employees.map((emp) => (
                                  <option key={emp} className="text-center" value={emp}>
                                    {emp}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}

                        <td className="min-w-[200px] border border-[#e0e2e6] px-3 py-[0.6rem] align-middle">
                        <textarea 
                          className="w-full h-12 p-2 border border-gray-200 rounded-[8px] resize-none overflow-hidden focus:overflow-y-auto transition-all duration-200" 
                          placeholder="Notes..."
                          disabled={!isEditing}
                          value={notes[`${day}-${slot}-notes`] || ''}
                          onChange={(e) => handleNoteChange(day, slot, e.target.value)}
                        >
                        </textarea>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-4 mt-4 mb-10 px-8">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingDays((prev) => ({ ...prev, [day]: true }))}
                    className="inline-flex items-center justify-center rounded-[8px] border border-[#d0d4d9] bg-white px-4 py-2 text-[0.9rem] font-semibold text-[#3c4043] hover:bg-[#f8f9fa]"
                  >
                    Edit Schedule
                  </button>
                )}

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => void handleSaveDay(day)}
                    className="inline-flex items-center justify-center rounded-[8px] bg-[#1a73e8] px-4 py-2 text-[0.9rem] font-semibold text-white hover:bg-[#1669d4]"
                  >
                    Update & Save
                  </button>
                )}
              </div>
            </div>
          )})}

          {/* Weekly Summary Table */}
          <div className="mx-auto mt-12 w-full max-w-[95%] overflow-hidden rounded-[15px] border border-[#e0e2e6]/70 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-sm">
            <header className="border-b border-[#e8eaed] bg-white px-8 py-6">
              <h2 className="m-0 text-[1.4rem] font-semibold text-[#1a1d23]">
                Weekly Summary
              </h2>
              <p className="m-0 mt-1 text-[0.9rem] text-[#5f6368]">
                Total hours by role for each team member
              </p>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-auto border-separate border-spacing-0 text-[0.9rem]">
                <thead>
                  <tr>
                    <th className="min-w-[80px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-4 py-3 text-center font-semibold text-white whitespace-nowrap">
                      No.
                    </th>
                    <th className="min-w-[200px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-4 py-3 text-left font-semibold text-white whitespace-nowrap">
                      Name
                    </th>
                    <th className="min-w-[140px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-4 py-3 text-center font-semibold text-white whitespace-nowrap">
                      Class (Coach)
                    </th>
                    <th className="min-w-[160px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-4 py-3 text-center font-semibold text-white whitespace-nowrap">
                      Executive
                    </th>
                    <th className="min-w-[160px] border border-[#e0e2e6] bg-gradient-to-r from-[#2c3e50] to-[#4ca1af] px-4 py-3 text-center font-semibold text-white whitespace-nowrap">
                      Total (hrs)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staffHoursSummary.map((row, index) => {
                    const isNeutral = row.assignedSlots === 0;
                    return (
                      <tr
                        key={row.name}
                        className="even:bg-[#fafbfc] hover:bg-[#f0f4f8]"
                      >
                        <td className="border border-[#e0e2e6] px-4 py-3 text-center align-middle">
                          {index + 1}
                        </td>
                        <td className="border border-[#e0e2e6] px-4 py-3 align-middle">
                          {row.name}
                        </td>
                        <td className="border border-[#e0e2e6] px-4 py-3 text-center align-middle">
                          {row.coachHrs.toFixed(2)}
                        </td>
                        <td className="border border-[#e0e2e6] px-4 py-3 text-center align-middle">
                          {row.execHrs.toFixed(2)}
                        </td>
                        <td className="border border-[#e0e2e6] px-4 py-3 text-center align-middle">
                          {isNeutral ? (
                            <span className="text-[#5f6368]">0.00</span>
                          ) : (
                            <span className="font-semibold text-[#1a1d23]">
                              {row.total.toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}