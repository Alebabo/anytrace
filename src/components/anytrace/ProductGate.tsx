import type { ReactNode } from "react";

export function ProductGate({
  children,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  return <>{children}</>;
}
