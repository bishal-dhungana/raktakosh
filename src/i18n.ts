import type { Locale } from "./types";

type Copy = Record<string, { en: string; ne: string }>;

export const copy: Copy = {
  findAvailability: { en: "Find availability", ne: "उपलब्धता खोज्नुहोस्" },
  requestBlood: { en: "Request coordination", ne: "समन्वय अनुरोध गर्नुहोस्" },
  signIn: { en: "Sign in", ne: "साइन इन" },
  dashboard: { en: "Dashboard", ne: "ड्यासबोर्ड" },
  signOut: { en: "Sign out", ne: "साइन आउट" },
  verifiedStep: { en: "Find the next verified step.", ne: "अर्को प्रमाणित कदम खोज्नुहोस्।" },
  heroBody: {
    en: "Raktakosh helps you find facility-reported availability, submit a private coordination request, and follow clear next steps.",
    ne: "रक्तकोषले संस्थाले रिपोर्ट गरेको उपलब्धता खोज्न, निजी समन्वय अनुरोध पठाउन र स्पष्ट अर्को कदम हेर्न मद्दत गर्छ।"
  },
  noGuarantee: {
    en: "Availability is facility-reported and time-stamped. It is not a reservation, compatibility decision, or guarantee.",
    ne: "उपलब्धता संस्थाले रिपोर्ट गरेको र समय-छाप भएको हो। यो आरक्षण, अनुकूलता निर्णय वा ग्यारेन्टी होइन।"
  },
  district: { en: "District", ne: "जिल्ला" },
  allDistricts: { en: "All districts", ne: "सबै जिल्ला" },
  chooseDistrict: { en: "Choose a district", ne: "जिल्ला छान्नुहोस्" },
  bloodGroup: { en: "Blood group", ne: "रक्त समूह" },
  component: { en: "Component", ne: "अवयव" },
  search: { en: "Search verified facilities", ne: "प्रमाणित संस्था खोज्नुहोस्" },
  lastUpdated: { en: "Last updated", ne: "पछिल्लो अद्यावधिक" },
  safetyTitle: { en: "A coordination tool, not a clinical decision", ne: "समन्वय उपकरण, चिकित्सकीय निर्णय होइन" },
  requestPrivate: { en: "Start a private request", ne: "निजी अनुरोध सुरु गर्नुहोस्" },
  howItWorks: { en: "How coordination works", ne: "समन्वय कसरी काम गर्छ" },
  language: { en: "नेपाली", ne: "English" }
};

export function t(locale: Locale, key: keyof typeof copy): string {
  return copy[key][locale];
}
