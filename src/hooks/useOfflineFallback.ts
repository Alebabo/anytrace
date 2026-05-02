import { useEffect, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

export interface OfflineDataset {
  alerts: import("@/data/types").ConvergenceAlert[];
  investors: import("@/data/types").Investor[];
  founders: import("@/data/types").Founder[];
}

/**
 * Offers an "Use offline data" escape hatch when an API query has been failing
 * for more than 10 seconds. Loads `mockData.ts` lazily so it isn't shipped
 * with the main bundle when the backend is healthy.
 */
export function useOfflineFallback(query: UseQueryResult<unknown>) {
  const [data, setData] = useState<OfflineDataset | null>(null);
  const [canEnable, setCanEnable] = useState(false);

  useEffect(() => {
    if (!query.isError) {
      setCanEnable(false);
      return;
    }
    const t = setTimeout(() => setCanEnable(true), 10_000);
    return () => clearTimeout(t);
  }, [query.isError, query.errorUpdatedAt]);

  const enable = async () => {
    const mod = await import("@/data/mockData");
    setData({
      alerts: mod.alerts,
      investors: mod.investors,
      founders: mod.founders,
    });
  };

  return { data, canEnable, enable };
}