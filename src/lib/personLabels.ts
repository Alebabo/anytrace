import type { TrackedPerson } from "@/data/anytrace";

export function isGenericTrackedRole(roleTitle?: string | null) {
  const normalized = roleTitle?.trim().toLowerCase() || "";
  return (
    normalized === "tracked x account" ||
    normalized === "tracked git person" ||
    normalized === "tracked builder" ||
    normalized === "observed github person"
  );
}

export function personDisplayLabel(person: TrackedPerson) {
  const company = person.company?.trim() || "";
  const roleTitle = !isGenericTrackedRole(person.roleTitle) ? person.roleTitle?.trim() || "" : "";

  if (company && roleTitle) return `${company} ${roleTitle}`;
  if (company) return company;
  if (roleTitle) return roleTitle;
  if (person.location?.trim()) return person.location.trim();
  return "Profile";
}
