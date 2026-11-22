import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../../test/stub";
import * as vercel from "../vercel";
import * as deployment from "./deployment";
import { deleteStaleBuildBoxes } from "./start";

let deleted: string[];

stub(vercel, {
	deleteSandbox: async (name: string) => {
		deleted.push(name);
	},
});
stub(deployment, { isProductionDeployment: () => false });

beforeEach(() => {
	deleted = [];
});

describe("deleteStaleBuildBoxes", () => {
	test("a non-production stale expiry deletes nothing", async () => {
		await deleteStaleBuildBoxes(["00000000-0000-0000-0000-0000000000b1"]);
		expect(deleted).toEqual([]);
	});
});
