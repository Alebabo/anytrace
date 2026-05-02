import { describe, it, expect } from "vitest";
import type { Investor } from "@/data/types";
import { investorCountryCode } from "@/lib/investorTags";
import { countryFlag, countryName } from "@/lib/country";

const make = (overrides: Partial<Investor>): Investor => ({
  id: "x",
  name: "Test",
  title: "",
  tier: "vc",
  avatarColor: "0 0% 50%",
  group: "",
  ...overrides,
});

const fixtures: Investor[] = [
  make({ id: "i-us-name", name: "Alice US", group: "United States" }),
  make({ id: "i-us-code", name: "Bob US", group: "US" }),
  make({ id: "i-de-name", name: "Carla DE", group: "Germany" }),
  make({ id: "i-de-code", name: "Dirk DE", group: "DE" }),
  make({ id: "i-unknown", name: "Eve ?", group: "Unknown" }),
  make({ id: "i-empty", name: "Frank ?", group: "" }),
  make({ id: "i-country-field", name: "Gina UK", group: "Unknown", country: "UK" }),
];

describe("investorCountryCode", () => {
  it("resolves full country names", () => {
    expect(investorCountryCode(fixtures[0])).toBe("US");
    expect(investorCountryCode(fixtures[2])).toBe("DE");
  });

  it("resolves 2-letter codes", () => {
    expect(investorCountryCode(fixtures[1])).toBe("US");
    expect(investorCountryCode(fixtures[3])).toBe("DE");
  });

  it("falls back to Europe (EU) for Unknown / empty", () => {
    expect(investorCountryCode(fixtures[4])).toBe("EU");
    expect(investorCountryCode(fixtures[5])).toBe("EU");
  });

  it("prefers explicit `country` over `group`, normalizes UK→GB", () => {
    expect(investorCountryCode(fixtures[6])).toBe("GB");
  });
});

describe("country badge rendering", () => {
  it("renders flag + name for resolvable investors", () => {
    // Every investor now resolves — Unknown/empty fall back to "EU".
    for (const inv of fixtures) {
      const code = investorCountryCode(inv)!;
      expect(countryFlag(code)).not.toBe("");
      expect(countryName(code)).not.toBe("");
    }
  });

  it("renders Europe fallback for Unknown / empty investors", () => {
    expect(investorCountryCode(fixtures[4])).toBe("EU");
    expect(countryName("EU")).toBe("Europe");
    expect(countryFlag("EU")).toBe("🇪🇺");
  });
});