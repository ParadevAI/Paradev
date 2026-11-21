import { describe, expect, it } from "bun:test";
import {
	cardArgs,
	pagesQuery,
	query,
	withoutRate,
	workspacePages,
} from "../../fixtures";
import type { CloudPeriod, CloudUsage } from "../../types";
import { priced, pricedPages, pricedQuery } from "./priced";

const { allowance, metered } = cardArgs("northwind");
const page = workspacePages()[0] as NonNullable<
	ReturnType<typeof workspacePages>[number]
>;

describe("priced", () => {
	it("passes usage with prices through", () => {
		expect(pricedQuery(query(page))).toMatchObject({
			data: page,
			isError: false,
		});
		expect(metered.usd).toBeGreaterThan(0);
	});

	it("turns usage without prices into a load failure", () => {
		expect(pricedQuery(query(withoutRate(page)))).toMatchObject({
			data: undefined,
			isError: true,
		});
		expect(
			pricedPages(pagesQuery(workspacePages().map(withoutRate))),
		).toMatchObject({ data: undefined, isError: true });
	});

	it("is still loading, not failed, before the data comes", () => {
		expect(pricedQuery(query<CloudUsage>(undefined)).isError).toBe(false);
		expect(pricedPages(pagesQuery<CloudUsage>(undefined)).isError).toBe(false);
	});

	it("refuses an allowance with a missing dollar field, at any depth", () => {
		if (!allowance) throw new Error("fixture");
		expect(priced(allowance)).toBe(allowance);
		expect(priced({ ...allowance, usedUsd: null })).toBeNull();
		const unpriced: CloudPeriod["allowance"] = {
			...allowance,
			extraUsageLimit: { gbHours: 10, usd: null },
		};
		expect(priced(unpriced)).toBeNull();
	});

	it("allows no included price only when the included total is not known", () => {
		if (!allowance) throw new Error("fixture");
		expect(priced({ ...allowance, includedUsd: null })).toBeNull();
		expect(
			priced({ ...allowance, includedGbHours: null, includedUsd: null }),
		).not.toBeNull();
	});
});
