import { getInterviews, getRecruitOptions } from "@/lib/recruitment/data";
import { RecruitmentCalendar } from "@/components/recruitment/recruitment-calendar";
import { PageHeader } from "../_components/placeholders";

// Access enforced by middleware (the /recruitment prefix is role-gated).
export const dynamic = "force-dynamic";

export default async function RecruitmentCalendarPage() {
  const [events, recruits] = await Promise.all([getInterviews(), getRecruitOptions()]);
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-10">
        <PageHeader title="Calendar" subtitle="Interview schedule — click a date to view, schedule or edit interviews" />
      </div>
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <RecruitmentCalendar events={events} recruits={recruits} />
      </div>
    </div>
  );
}
