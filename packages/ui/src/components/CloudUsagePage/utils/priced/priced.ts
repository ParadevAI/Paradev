import type {
	CloudBoots,
	CloudMetrics,
	CloudPages,
	CloudPeriod,
	CloudQuery,
	CloudUsage,
	CloudUsageRow,
} from "../../types";

/** Null only when the included total itself is not known. */
type KeepsNull = "includedUsd";

/** A router output with every dollar field present: `usageUsd`, `usedUsd`, `usd` and the rest. */
export type Priced<T> = T extends Date
	? T
	: T extends readonly (infer Item)[]
		? Priced<Item>[]
		: T extends object
			? {
					[K in keyof T]: K extends KeepsNull
						? T[K]
						: K extends `${string}Usd` | "usd"
							? Exclude<T[K], null>
							: Priced<T[K]>;
				}
			: T;

export type PricedUsage = Priced<CloudUsage>;
export type PricedRow = Priced<CloudUsageRow>;
export type PricedMetrics = Priced<CloudMetrics>;
export type PricedBoots = Priced<CloudBoots>;
export type PricedAllowance = Priced<NonNullable<CloudPeriod["allowance"]>>;

const isDollars = (key: string) => key === "usd" || key.endsWith("Usd");

/** `value` itself when every dollar field in it is present, else null. */
export function priced<T>(value: T): Priced<T> | null {
	const check = (node: unknown): boolean => {
		if (Array.isArray(node)) return node.every(check);
		if (node === null || typeof node !== "object" || node instanceof Date)
			return true;
		const record = node as Record<string, unknown>;
		return Object.entries(record).every(([key, item]) =>
			key === "includedUsd"
				? item !== null || record.includedGbHours === null
				: isDollars(key)
					? item !== null
					: check(item),
		);
	};
	return check(value) ? (value as Priced<T>) : null;
}

/** Usage without prices is a load failure: the pages show usage in dollars only. */
export function pricedQuery<T>(query: CloudQuery<T>): CloudQuery<Priced<T>> {
	const data =
		query.data === undefined ? undefined : (priced(query.data) ?? undefined);
	return {
		data,
		isError: query.isError || (query.data !== undefined && data === undefined),
		refetch: query.refetch,
	};
}

export function pricedPages<T>(query: CloudPages<T>): CloudPages<Priced<T>> {
	const pages = query.data?.pages.map(priced);
	const all = pages?.every((page) => page !== null)
		? (pages as Priced<T>[])
		: undefined;
	return {
		...query,
		data: all && { pages: all },
		isError: query.isError || (pages !== undefined && all === undefined),
	};
}
