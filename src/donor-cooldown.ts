const nepalTimeZone = "Asia/Kathmandu";
export const DEFAULT_DONATION_COOLDOWN_MONTHS = 3;

type DateParts = { year: number; month: number; day: number };

function nepalDateParts(reference: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: nepalTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(reference);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateOnly(parts: DateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateOnly(value: string | null | undefined): DateParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function donationCooldownMonths(): number {
  const configured = Number(process.env.DONATION_COOLDOWN_MONTHS ?? DEFAULT_DONATION_COOLDOWN_MONTHS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 12 ? configured : DEFAULT_DONATION_COOLDOWN_MONTHS;
}

export function nepalCalendarDate(reference = new Date()): string {
  return dateOnly(nepalDateParts(reference));
}

export function isValidDonationDate(value: string): boolean {
  return parseDateOnly(value) !== null;
}

export function donationCooldownUntil(lastDonationDate: string | null | undefined, months = donationCooldownMonths()): string | null {
  const donation = parseDateOnly(lastDonationDate);
  if (!donation) return null;
  const targetMonthIndex = donation.month - 1 + months;
  const targetYear = donation.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  return dateOnly({ year: targetYear, month: targetMonth, day: Math.min(donation.day, daysInMonth(targetYear, targetMonth)) });
}

export function donationCooldownActive(lastDonationDate: string | null | undefined, reference = new Date(), months = donationCooldownMonths()): boolean {
  const until = donationCooldownUntil(lastDonationDate, months);
  return until !== null && nepalCalendarDate(reference) < until;
}
