export const NPHL_BLOOD_BANK_DIRECTORY_URL = "https://donateblood.nphl.gov.np/btscs";
export const NPHL_BLOOD_BANK_SOURCE_LABEL = "National Public Health Laboratory (NPHL) BTSC directory";

export type BloodBankStockEntry = {
  component: string;
  componentCategory: string;
  bloodGroup: string;
  rhFactor: string;
  quantity: number;
};

export type OfficialBloodBank = {
  externalId: string;
  name: string;
  province: string | null;
  district: string;
  sourceDistrict: string;
  municipality: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  services: string | null;
  totalStock: number;
  stock: BloodBankStockEntry[];
};

type DirectoryListing = Pick<OfficialBloodBank, "externalId" | "name" | "services">;

type NphlStockResponse = {
  data?: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    address?: unknown;
    province?: { name?: unknown } | null;
    district?: { name?: unknown } | null;
    municipality?: { name?: unknown } | null;
    total_stock?: unknown;
    stock_by_component?: Array<{ component?: unknown; by_blood_group?: Record<string, unknown> }>;
  };
};

const districtAliases: Record<string, string> = {
  "अछाम": "Achham", "अर्घाखाँची": "Arghakhanchi", "बागलुङ": "Baglung", "बैतडी": "Baitadi", "बझाङ": "Bajhang", "बाँके": "Banke", "बारा": "Bara", "बर्दिया": "Bardiya", "भक्तपुर": "Bhaktapur", "भोजपुर": "Bhojpur", "चितवन": "Chitwan", "डडेलधुरा": "Dadeldhura", "दैलेख": "Dailekh", "दाङ": "Dang", "दार्चुला": "Darchula", "धादिङ": "Dhading", "धनकुटा": "Dhankuta", "धनुषा": "Dhanusha", "डोल्पा": "Dolpa", "डोटी": "Doti", "इलाम": "Ilam", "झापा": "Jhapa", "जाजरकोट": "Jajarkot", "काठमाडौँ": "Kathmandu", "काठमाण्डौ": "Kathmandu", "काठमाण्डौं": "Kathmandu", "कास्की": "Kaski", "काभ्रेपलाञ्चोक": "Kavrepalanchok", "कपिलवस्तु": "Kapilvastu", "खोटाङ": "Khotang", "ललितपुर": "Lalitpur", "लमजुङ": "Lamjung", "महोत्तरी": "Mahottari", "मकवानपुर": "Makwanpur", "मनाङ": "Manang", "मोरङ": "Morang", "मुगु": "Mugu", "मुस्ताङ": "Mustang", "म्याग्दी": "Myagdi", "नवलपुर": "Nawalpur", "नवलपरासी": "Nawalparasi West", "नुवाकोट": "Nuwakot", "ओखलढुंगा": "Okhaldhunga", "पाल्पा": "Palpa", "पाँचथर": "Panchthar", "पर्बत": "Parbat", "पर्सा": "Parsa", "प्युठान": "Pyuthan", "रामेछाप": "Ramechhap", "रसुवा": "Rasuwa", "रौतहट": "Rautahat", "रोल्पा": "Rolpa", "रुकुम पूर्व": "Rukum East", "रुकुम पश्चिम": "Rukum West", "रुपन्देही": "Rupandehi", "सल्यान": "Salyan", "संखुवासभा": "Sankhuwasabha", "सप्तरी": "Saptari", "सर्लाही": "Sarlahi", "सिन्धुली": "Sindhuli", "सिन्धुपाल्चोक": "Sindhupalchok", "सिराहा": "Siraha", "सोलुखुम्बु": "Solukhumbu", "सुनसरी": "Sunsari", "सुर्खेत": "Surkhet", "स्याङ्जा": "Syangja", "तनहुँ": "Tanahun", "ताप्लेजुङ": "Taplejung", "तेह्रथुम": "Terhathum", "उदयपुर": "Udayapur", "बाजुरा": "Bajura", "जुम्ला": "Jumla", "कालिकोट": "Kalikot", "कञ्चनपुर": "Kanchanpur", "दोलखा": "Dolakha", "गोरखा": "Gorkha", "गुल्मी": "Gulmi", "हुम्ला": "Humla", "सिन्धुपालचोक": "Sindhupalchok"
};

function plainText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function removeTags(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function nphlDistrictToCanonical(sourceDistrict: string): string | null {
  return districtAliases[sourceDistrict.replace(/\s+/g, " ").trim()] ?? null;
}

export function componentCategory(component: string): string {
  const normalized = component.toLowerCase();
  if (normalized.includes("platelet")) return "Platelets";
  if (normalized.includes("plasma") || normalized.includes("ffp") || normalized === "prp") return "Plasma";
  if (normalized.includes("whole blood") || normalized.includes("cpda")) return "Whole blood";
  if (normalized.includes("red cell")) return "Packed red cells";
  return "Other";
}

export function parseNphlDirectoryPage(html: string): DirectoryListing[] {
  const rows = html.match(/<tr\s+class="btsc-row"[\s\S]*?<\/tr>/gi) ?? [];
  const entries = rows.map((row) => {
    const externalId = /data-btsc-id="([^"]+)"/i.exec(row)?.[1];
    const name = /data-btsc-name="([^"]+)"/i.exec(row)?.[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    const services = cells[3] ? removeTags(cells[3][1]) : null;
    return externalId && name ? { externalId, name: decodeHtml(name), services } : null;
  }).filter((entry): entry is DirectoryListing => entry !== null);
  const deduplicated = new Map(entries.map((entry) => [entry.externalId, entry]));
  return [...deduplicated.values()];
}

function stockEntries(raw: NphlStockResponse["data"]): BloodBankStockEntry[] {
  const totals = new Map<string, BloodBankStockEntry>();
  for (const componentRow of raw?.stock_by_component ?? []) {
    const component = plainText(componentRow.component);
    if (!component) continue;
    for (const [key, rawQuantity] of Object.entries(componentRow.by_blood_group ?? {})) {
      const match = /^(AB|A|B|O)([+-])$/.exec(key.trim());
      const quantity = Number(rawQuantity);
      if (!match || !Number.isFinite(quantity) || quantity <= 0) continue;
      const category = componentCategory(component);
      const identity = `${category}|${match[1]}|${match[2]}`;
      const existing = totals.get(identity);
      if (existing) existing.quantity += Math.trunc(quantity);
      else totals.set(identity, { component, componentCategory: category, bloodGroup: match[1], rhFactor: match[2], quantity: Math.trunc(quantity) });
    }
  }
  return [...totals.values()].sort((a, b) => a.componentCategory.localeCompare(b.componentCategory) || a.bloodGroup.localeCompare(b.bloodGroup) || a.rhFactor.localeCompare(b.rhFactor));
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<NphlStockResponse> {
  const response = await fetchImpl(url, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`NPHL stock endpoint returned ${response.status}.`);
  return response.json() as Promise<NphlStockResponse>;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function fetchOfficialBloodBanks(fetchImpl: typeof fetch = fetch): Promise<OfficialBloodBank[]> {
  const response = await fetchImpl(NPHL_BLOOD_BANK_DIRECTORY_URL, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`NPHL directory returned ${response.status}.`);
  const listings = parseNphlDirectoryPage(await response.text());
  if (!listings.length) throw new Error("NPHL directory did not contain any Blood Transfusion Service Centres.");
  return mapWithConcurrency(listings, 4, async (listing) => {
    const payload = await fetchJson(`${NPHL_BLOOD_BANK_DIRECTORY_URL}/stock/${encodeURIComponent(listing.externalId)}`, fetchImpl);
    const data = payload.data;
    const sourceDistrict = plainText(data?.district?.name);
    const district = sourceDistrict ? nphlDistrictToCanonical(sourceDistrict) : null;
    if (!district || !sourceDistrict) throw new Error(`NPHL directory entry ${listing.externalId} has an unmapped district.`);
    return {
      externalId: listing.externalId,
      name: plainText(data?.name) ?? listing.name,
      province: plainText(data?.province?.name),
      district,
      sourceDistrict,
      municipality: plainText(data?.municipality?.name),
      address: plainText(data?.address),
      phone: plainText(data?.phone),
      email: plainText(data?.email),
      services: listing.services,
      totalStock: Math.max(0, Math.trunc(Number(data?.total_stock) || 0)),
      stock: stockEntries(data)
    };
  });
}
