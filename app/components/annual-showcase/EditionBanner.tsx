"use client";

type EditionStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "TEST_RUN"
  | "EVENT_ACTIVE"
  | "POST_EVENT"
  | "ARCHIVED";

interface EditionBannerProps {
  editionName: string;
  theme: string;
  status: EditionStatus;
  participantCount: number;
  participantTarget: number;
}

const STATUS_LABELS: Record<EditionStatus, string> = {
  DRAFT:             "Draft",
  REGISTRATION_OPEN: "Registration Open",
  TEST_RUN:          "Test Run",
  EVENT_ACTIVE:      "Event Active",
  POST_EVENT:        "Post-Event",
  ARCHIVED:          "Archived",
};

const STATUS_COLORS: Record<EditionStatus, string> = {
  DRAFT:             "bg-gray-200 text-gray-700",
  REGISTRATION_OPEN: "bg-green-400/30 text-green-100 border border-green-300/50",
  TEST_RUN:          "bg-blue-400/30 text-blue-100 border border-blue-300/50",
  EVENT_ACTIVE:      "bg-red-400/30 text-red-100 border border-red-300/50",
  POST_EVENT:        "bg-purple-400/30 text-purple-100 border border-purple-300/50",
  ARCHIVED:          "bg-gray-400/30 text-gray-100 border border-gray-300/50",
};

export default function EditionBanner({
  editionName,
  theme,
  status,
  participantCount,
  participantTarget,
}: EditionBannerProps) {
  const progress = participantTarget > 0
    ? Math.min(100, Math.round((participantCount / participantTarget) * 100))
    : 0;

  return (
    <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white px-6 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold truncate">{editionName}</h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-orange-100 text-sm mt-0.5 truncate">Theme: {theme}</p>
        </div>

        <div className="shrink-0 min-w-[180px]">
          <div className="flex items-center justify-between text-xs text-orange-100 mb-1.5">
            <span>Participants</span>
            <span className="font-semibold">
              {participantCount.toLocaleString()} / {participantTarget.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-orange-800/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-orange-100 mt-1 text-right">{progress}% of target</p>
        </div>
      </div>
    </div>
  );
}
