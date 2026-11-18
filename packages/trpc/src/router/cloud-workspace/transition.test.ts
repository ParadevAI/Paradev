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
	test("an archived row keeps why it failed; a row live again drops it", async () => {
		written.length = 0;
		await transitionCloudWorkspace({
			id: "ws_1",
			from: ["failed"],
			to: "archived",
		});
		await transitionCloudWorkspace({
			id: "ws_1",
			from: ["archived"],
			to: "asleep",
			set: { deletedAt: null },
		});
		expect(written).toEqual([
			{ status: "archived" },
			{
				failureReason: null,
				failedAt: null,
				deletedAt: null,
				status: "asleep",
			},
		]);
	});
});
