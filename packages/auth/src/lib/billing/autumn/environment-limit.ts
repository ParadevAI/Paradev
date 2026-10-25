import type { getAutumnCustomer } from "./customer";
import { ENVIRONMENTS_FEATURE_ID } from "./features";

type Balances = Awaited<ReturnType<typeof getAutumnCustomer>>["balances"];

/** A string rather than Infinity because the state is cached as JSON. */
export type EnvironmentLimit = number | "unlimited" | null;

/** How many environments the plan grants; `null` when it carries no such feature. */
export function environmentLimitFromBalances(
	balances: Balances,
): EnvironmentLimit {
	const balance = balances[ENVIRONMENTS_FEATURE_ID];
	if (!balance) return null;
	return balance.unlimited ? "unlimited" : balance.granted;
}
