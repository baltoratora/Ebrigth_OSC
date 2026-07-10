import { AgeCategory } from "@fa/_types";

// Module band (age group) badge — Junior / Middler / Senior. The band is the
// same value the certificate prints (student.ageCategory, sourced from
// studentrecords.age_group). Shown next to the grade on the Student List and
// the attendance roster so responders/marketing see a student's module at a glance.
const STYLE: Record<AgeCategory, string> = {
  Junior:  "bg-sky-100 text-sky-700",
  Middler: "bg-amber-100 text-amber-700",
  Senior:  "bg-violet-100 text-violet-700",
};

export function ModuleBadge({ category }: { category: AgeCategory }) {
  return (
    <span
      className={`fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded ${STYLE[category]}`}
      style={{ letterSpacing: "0.06em" }}
      title="Module (age band)"
    >
      {category}
    </span>
  );
}
