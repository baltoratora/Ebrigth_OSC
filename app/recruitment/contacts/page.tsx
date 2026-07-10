import { getRecruitsList } from "@/lib/recruitment/data";
import { ContactsTable } from "@/components/recruitment/contacts-table";
import { PageHeader } from "../_components/placeholders";

export const dynamic = "force-dynamic";

export default async function RecruitmentContactsPage() {
  const rows = (await getRecruitsList()).map((r) => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    position: r.position, branch: r.branch, hired: r.hired,
    stageName: r.stageName, stageShort: r.stageShort,
  }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Contacts" subtitle={`${rows.length} recruits — contact details and current stage`} />
      <ContactsTable rows={rows} />
    </div>
  );
}
