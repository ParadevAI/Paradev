import { describe, expect, it } from "bun:test";
import {
	allowanceFixtures,
	pagesQuery,
	query,
	usageFixtures,
	withoutRate,
	workspacePages,
} from "../../fixtures";
import type { CloudUsage } from "../../types";
import {
	pricedAllowance,
	pricedPages,
	pricedQuery,
	pricedUsage,
} from "./priced";

describe("priced", () => {
	it("passes usage with prices through", () => {
		const usage = pricedQuery(query(usageFixtures.byDay), pricedUsage);
		expect(usage).toMatchObject({ data: usageFixtures.byDay, isError: false });
	});

	it("turns usage without prices into a load failure", () => {
		const usage = pricedQuery(
			query(withoutRate(usageFixtures.byDay)),
			pricedUsage,
		);
		expect(usage).toMatchObject({ data: undefined, isError: true });
		const pages = pricedPages(
			pagesQuery(workspacePages().map(withoutRate)),
			pricedUsage,
		);
		expect(pages).toMatchObject({ data: undefined, isError: true });
	});

	it("is still loading, not failed, before the data comes", () => {
		expect(pricedQuery(query<CloudUsage>(undefined), pricedUsage).isError).toBe(
			false,
		);
		expect(
			pricedPages(pagesQuery<CloudUsage>(undefined), pricedUsage).isError,
		).toBe(false);
	});

	it("refuses an allowance without dollars", () => {
		const allowance = allowanceFixtures.freeCredits;
		if (!allowance) throw new Error("fixture");
		expect(pricedAllowance(allowance)).toBe(allowance);
		expect(pricedAllowance({ ...allowance, usedUsd: null })).toBeNull();
		expect(
			pricedAllowance({
				...allowance,
				extraUsageLimit: { gbHours: 10, usd: null },
			}),
		).toBeNull();
	});
});
