export function isTraqrDemoMode() {
  return import.meta.env.VITE_TRAQR_DEMO === "true";
}

export function traqrDemoLabel() {
  return import.meta.env.VITE_TRAQR_DEMO_LABEL?.trim() || "";
}
