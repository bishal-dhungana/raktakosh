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
  verifiedCoordination: { en: "Verified coordination", ne: "प्रमाणित समन्वय" },
  coordinationStepOne: { en: "Search facility-reported availability", ne: "संस्थाले रिपोर्ट गरेको उपलब्धता खोज्नुहोस्" },
  coordinationStepTwo: { en: "Send a private request to a verified facility", ne: "प्रमाणित संस्थामा निजी अनुरोध पठाउनुहोस्" },
  coordinationStepThree: { en: "Let the responsible facility confirm the next step", ne: "जिम्मेवार संस्थाले अर्को कदम पुष्टि गर्छ" },
  educationKicker: { en: "BLOOD DONATION, EXPLAINED", ne: "रक्तदान, सरल व्याख्या" },
  educationTitle: { en: "Clear information before every decision.", ne: "हरेक निर्णयअघि स्पष्ट जानकारी।" },
  whatBloodTitle: { en: "What is blood?", ne: "रगत के हो?" },
  whatBloodBody: { en: "Blood may be used as whole blood or prepared into components such as red cells, platelets, and plasma, depending on the patient’s clinical need.", ne: "बिरामीको चिकित्सकीय आवश्यकताअनुसार रगतलाई सम्पूर्ण रगत वा रातो रक्तकोषिका, प्लेटलेट र प्लाज्माजस्ता अवयवका रूपमा प्रयोग गर्न सकिन्छ।" },
  whyDonateTitle: { en: "Why does donation matter?", ne: "रक्तदान किन महत्त्वपूर्ण छ?" },
  whyDonateBody: { en: "Safe blood and blood components support patients during emergencies, childbirth, surgery, cancer treatment, and ongoing care for serious conditions.", ne: "सुरक्षित रगत तथा रक्तअवयवले आपतकाल, प्रसूति, शल्यक्रिया, क्यान्सर उपचार र गम्भीर अवस्थाको निरन्तर हेरचाहमा बिरामीलाई सहयोग गर्छ।" },
  donationSafetyTitle: { en: "Who decides if I can donate?", ne: "म रक्तदान गर्न सक्छु कि सक्दिनँ कसले निर्णय गर्छ?" },
  donationSafetyBody: { en: "A participating blood-service facility reviews donor information and makes the final eligibility decision. Raktakosh never makes a medical decision for you.", ne: "सहभागी रक्तसेवा संस्थाले दाताको जानकारी समीक्षा गरेर अन्तिम योग्यताको निर्णय गर्छ। रक्तकोषले तपाईंका लागि चिकित्सकीय निर्णय गर्दैन।" },
  language: { en: "नेपाली", ne: "English" }
};

export function t(locale: Locale, key: keyof typeof copy): string {
  return copy[key][locale];
}
