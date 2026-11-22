import {
	PERIODS_INPUT,
	selectedPeriod,
	usageRange,
} from "@superset/ui/cloud-usage-page";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The billing periods, and the one the route's `period` names. */
export function useCloudUsagePeriod(periodId: string | undefined) {
	const periods = cloudTrpc.cloud.periods.list.useQuery(PERIODS_INPUT);
	const period = selectedPeriod(periods.data?.items, periodId);
	return { periods, period, range: usageRange(period) };
}
