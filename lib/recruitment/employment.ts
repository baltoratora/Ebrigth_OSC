// Employment types for manually-added recruitment candidates.
//
// Kept in a plain module (NOT the "use server" app/recruitment/_actions.ts) so
// the constant can be imported by both client components and server actions —
// a "use server" file may only export async functions, so exporting a value
// (this array) from there breaks the whole actions module at build/runtime.
export const EMPLOYMENT_TYPES = ["Internship", "Part Time", "Full Time"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// career_applications enforces CHECK constraints on these columns, so the
// Add Opportunity form must offer exactly these values (career_applications_
// gender_check / _education_level_check).
export const GENDERS = ["Male", "Female"] as const;
export type Gender = (typeof GENDERS)[number];

export const EDUCATION_LEVELS = ["Diploma", "Degree"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
