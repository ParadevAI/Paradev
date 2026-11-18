import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { transitionCloudWorkspace } from "./transition";

const written: Record<string, unknown>[] = [];
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => {
			written.push(values);
			return { where: () => ({ returning: async () => [{ id: "ws_1" }] }) };
		},
	}),
});

describe("transitionCloudWorkspace", () => {
	test("a row that leaves failed drops its failure reason and time", async () => {
		await transitionCloudWorkspace({
			id: "ws_1",
			from: ["failed"],
			to: "archived",
		});
		expect(written).toEqual([
			{ failureReason: null, failedAt: null, status: "archived" },
		]);
	});
});
