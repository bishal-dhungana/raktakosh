export const DONOR_SCREENING_VERSION = "v1";

export const DONOR_SCREENING_QUESTIONS = [
  {
    key: "currently_unwell",
    label: "Are you currently unwell, recovering from an infection, or taking antibiotics for an infection?"
  },
  {
    key: "medical_condition_or_medicine",
    label: "Do you have a medical condition or prescribed medicine that a blood-centre clinician should review before donation?"
  },
  {
    key: "recent_procedure_or_tattoo",
    label: "Have you recently had a procedure, surgery, tattoo, piercing, or dental treatment that needs a donation deferral review?"
  },
  {
    key: "previous_donation_reaction",
    label: "Have you previously had a reaction or been deferred when trying to donate blood?"
  },
  {
    key: "pregnancy_or_postpartum",
    label: "Are you pregnant, recently postpartum, or breastfeeding?"
  },
  {
    key: "travel_or_infection_risk",
    label: "Do recent travel, exposure, testing, or health information need a confidential blood-centre review?"
  }
] as const;

export type DonorScreeningQuestionKey = (typeof DONOR_SCREENING_QUESTIONS)[number]["key"];
export type DonorScreeningAnswer = "yes" | "no" | "unsure" | "not_applicable";
export type DonorEligibilityStatus = "not_started" | "pending" | "needs_review" | "provisionally_eligible" | "not_eligible_now";

export function isDonorScreeningAnswer(value: unknown): value is DonorScreeningAnswer {
  return value === "yes" || value === "no" || value === "unsure" || value === "not_applicable";
}

function kathmanduDateParts(reference: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(reference);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function deriveAge(dateOfBirth: string, reference = new Date()): number | null {
  const birth = dateParts(dateOfBirth);
  if (!birth) return null;
  const today = kathmanduDateParts(reference);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age;
}

export function isValidDateOfBirth(dateOfBirth: string, reference = new Date()): boolean {
  const age = deriveAge(dateOfBirth, reference);
  return age !== null && age >= 0 && age <= 120;
}

export function hasCompleteScreeningAnswers(value: unknown): value is Record<DonorScreeningQuestionKey, DonorScreeningAnswer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answers = value as Record<string, unknown>;
  return DONOR_SCREENING_QUESTIONS.every((question) => isDonorScreeningAnswer(answers[question.key]))
    && Object.keys(answers).every((key) => DONOR_SCREENING_QUESTIONS.some((question) => question.key === key));
}

export function preliminaryEligibilityStatus(answers: Record<DonorScreeningQuestionKey, DonorScreeningAnswer>): "pending" | "needs_review" {
  return Object.values(answers).some((answer) => answer === "yes" || answer === "unsure") ? "needs_review" : "pending";
}
