import type {
	CloudBoot,
	CloudBoots,
	CloudMetrics,
	CloudPages,
	CloudPeriod,
	CloudQuery,
	CloudUsage,
	CloudUsageRow,
} from "../../types";

type WithUsd<T> = Omit<T, "usageUsd"> & { usageUsd: number };

export type PricedMetrics = WithUsd<CloudMetrics>;
export type PricedRow = WithUsd<CloudUsageRow>;
export type PricedUsage = Omit<CloudUsage, "items" | "total"> & {
	items: PricedRow[];
	total: PricedMetrics;
};
export type PricedBoot = WithUsd<CloudBoot>;
export type PricedBoots = Omit<CloudBoots, "items"> & { items: PricedBoot[] };

type Allowance = NonNullable<CloudPeriod["allowance"]>;
type Credit = NonNullable<Allowance["bought"]>;
type PricedCredit = Omit<Credit, "usedUsd" | "totalUsd"> & {
	usedUsd: number;
	totalUsd: number;
};
export type PricedAllowance = Omit<
	Allowance,
	| "usedUsd"
	| "includedUsd"
	| "overageUsd"
	| "bought"
	| "freeCredits"
	| "extraUsageLimit"
> & {
	usedUsd: number;
	/** Null only when the included total is not known. */
	includedUsd: number | null;
	overageUsd: number;
	bought: PricedCredit | null;
	freeCredits: PricedCredit | null;
	extraUsageLimit: { gbHours: number; usd: number } | null;
};

const hasUsd = (item: { usageUsd: number | null }) => item.usageUsd !== null;
const creditPriced = (credit: Credit | null) =>
	credit === null || (credit.usedUsd !== null && credit.totalUsd !== null);

export function pricedUsage(usage: CloudUsage): PricedUsage | null {
	return hasUsd(usage.total) && usage.items.every(hasUsd)
		? (usage as PricedUsage)
		: null;
}

export function pricedBoots(boots: CloudBoots): PricedBoots | null {
	return boots.items.every(hasUsd) ? (boots as PricedBoots) : null;
}

export function pricedAllowance(allowance: Allowance): PricedAllowance | null {
	const priced =
		allowance.usedUsd !== null &&
		allowance.overageUsd !== null &&
		(allowance.includedUsd !== null || allowance.includedGbHours === null) &&
		creditPriced(allowance.bought) &&
		creditPriced(allowance.freeCredits) &&
		(allowance.extraUsageLimit === null ||
			allowance.extraUsageLimit.usd !== null);
	return priced ? (allowance as PricedAllowance) : null;
}

/** Usage without prices is a load failure: the pages show usage in dollars only. */
export function pricedQuery<TData, TPriced>(
	query: CloudQuery<TData>,
	price: (data: TData) => TPriced | null,
): CloudQuery<TPriced> {
	const data =
		query.data === undefined ? undefined : (price(query.data) ?? undefined);
	return {
		data,
		isError: query.isError || (query.data !== undefined && data === undefined),
		refetch: query.refetch,
	};
}

export function pricedPages<TPage, TPriced>(
	query: CloudPages<TPage>,
	price: (page: TPage) => TPriced | null,
): CloudPages<TPriced> {
	const pages = query.data?.pages.map(price);
	const all = pages?.every((page) => page !== null)
		? (pages as TPriced[])
		: undefined;
	return {
		...query,
		data: all && { pages: all },
		isError: query.isError || (pages !== undefined && all === undefined),
	};
}
