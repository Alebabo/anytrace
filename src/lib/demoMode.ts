export function isAnytraceDemoMode() {
  return import.meta.env.VITE_ANYTRACE_DEMO === "true";
}

export function anytraceDemoLabel() {
  return import.meta.env.VITE_ANYTRACE_DEMO_LABEL?.trim() || "";
}
