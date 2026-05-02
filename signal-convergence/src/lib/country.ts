const NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  SE: "Sweden",
  CH: "Switzerland",
  ES: "Spain",
  IT: "Italy",
  CA: "Canada",
  IL: "Israel",
  IN: "India",
  SG: "Singapore",
  AU: "Australia",
  JP: "Japan",
  IE: "Ireland",
  DK: "Denmark",
  FI: "Finland",
  NO: "Norway",
  PT: "Portugal",
  BE: "Belgium",
  AT: "Austria",
  EU: "Europe",
};

/** Reverse + alias map of common country names → ISO alpha-2 code. */
const NAME_TO_CODE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [code, name] of Object.entries(NAMES)) {
    map[name.toLowerCase()] = code === "UK" ? "GB" : code;
  }
  Object.assign(map, {
    "usa": "US",
    "u.s.": "US",
    "u.s.a.": "US",
    "america": "US",
    "united states of america": "US",
    "uk": "GB",
    "u.k.": "GB",
    "great britain": "GB",
    "england": "GB",
    "scotland": "GB",
    "deutschland": "DE",
    "holland": "NL",
    "the netherlands": "NL",
    "swiss": "CH",
    "korea": "KR",
    "south korea": "KR",
    "uae": "AE",
    "united arab emirates": "AE",
  });
  return map;
})();

/**
 * Resolve any country-ish string (ISO code or full name) to an ISO alpha-2 code.
 * Returns undefined if the input is empty / "Unknown" / unrecognized.
 */
export function resolveCountryCode(input?: string): string | undefined {
  if (!input) return undefined;
  const v = input.trim();
  if (!v || /^unknown$/i.test(v)) return undefined;
  if (/^[A-Za-z]{2}$/.test(v)) {
    const cc = v.toUpperCase();
    return cc === "UK" ? "GB" : cc;
  }
  return NAME_TO_CODE[v.toLowerCase()];
}

/** Convert ISO alpha-2 country code to flag emoji. UK is normalized to GB. */
export function countryFlag(code?: string): string {
  if (!code) return "";
  const cc = code.toUpperCase() === "UK" ? "GB" : code.toUpperCase();
  if (cc.length !== 2) return "";
  // Special-case: render the EU flag for our "Europe" fallback bucket.
  if (cc === "EU") return "🇪🇺";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

export function countryName(code?: string): string {
  if (!code) return "";
  const cc = code.toUpperCase() === "UK" ? "GB" : code.toUpperCase();
  return NAMES[cc] ?? cc;
}