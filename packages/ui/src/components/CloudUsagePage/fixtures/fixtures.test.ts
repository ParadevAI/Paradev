import { describe, expect, it } from "bun:test";
import type { WorkspaceRef } from "../types";
import {
	type BillingState,
	overviewArgs,
	workspaceArgs,
	workspacePages,
} from "./fixtures";

const STATES: BillingState[] = [
	"northwind",
	"trial",
	"prepaid",
	"limitReached",
	"percentCap",
	"notRead",
	"unbilled",
];
const refOf = (row: { ref: unknown }) => row.ref as WorkspaceRef;

describe("story fixtures hold only states the router can return", () => {
	it("stops workspaces at the usage limit only in the state that reached it", () => {
		for (const state of STATES) {
			const rows = overviewArgs(state).workspaces.data?.items ?? [];
			const atLimit = rows.filter(
				(row) => refOf(row).lastBoot?.endReason === "usage_limit",
			);
			if (state === "limitReached") {
				expect(atLimit.length).toBeGreaterThan(0);
				expect(rows.some((row) => refOf(row).status === "awake")).toBe(false);
			} else {
				expect(atLimit).toEqual([]);
			}
		}
	});

	it("bills nothing for a boot that could not start", () => {
		const boots = workspaceArgs("failed").boots.data?.pages[0]?.items ?? [];
		const failed = boots.filter((boot) => boot.endReason === "failed");
		expect(failed.length).toBe(1);
		expect(failed[0]).toMatchObject({ gbHours: 0, usageUsd: 0 });
		expect(failed[0]?.minutes).toBeLessThan(1);
	});

	it("gives every stopped boot an end reason", () => {
		const boots = workspaceArgs("asleep").boots.data?.pages[0]?.items ?? [];
		expect(
			boots.every((boot) => boot.stoppedAt === null || boot.endReason !== null),
		).toBe(true);
	});

	it("orders rows by usage when it orders them by GB-hours, as one rate prices every row", () => {
		const rows = workspacePages().flatMap((page) => page.items);
		const usage = rows.map((row) => row.usageUsd);
		expect(usage).toEqual([...usage].sort((a, b) => b - a));
	});
});
