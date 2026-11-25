"use client";

import {
	PERIODS_INPUT,
	selectedPeriod,
	usageRange,
} from "@superset/ui/cloud-usage-page";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/react";

/** The billing periods, and the one in the URL's `period`. */
export function useCloudUsagePeriod() {
	const trpc = useTRPC();
	const periods = useQuery(trpc.cloud.periods.list.queryOptions(PERIODS_INPUT));
	const period = selectedPeriod(
		periods.data?.items,
		useSearchParams().get("period") ?? undefined,
	);
	return { periods, period, range: usageRange(period) };
}
