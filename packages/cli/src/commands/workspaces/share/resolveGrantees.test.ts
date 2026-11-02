import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../../../lib/api-client";
import { resolveGrantees } from "./resolveGrantees";

const api = {
	organization: {
		members: {
			list: {
				query: async () => [
					{ id: "user-2", email: "joann@example.com" },
					{ id: "user-1", email: "ann@example.com" },
				],
			},
		},
	},
} as unknown as ApiClient;

describe("resolveGrantees", () => {
	it("matches a member's email exactly and passes ids through", async () => {
		const teamId = "00000000-0000-4000-8000-000000000001";
		expect(await resolveGrantees(api, ["ANN@example.com"], [teamId])).toEqual([
			{ kind: "user", userId: "user-1" },
			{ kind: "team", teamId },
		]);
		const userId = "00000000-0000-4000-8000-000000000002";
		expect(await resolveGrantees(api, [userId], [])).toEqual([
			{ kind: "user", userId },
		]);
		await expect(resolveGrantees(api, ["bob@example.com"], [])).rejects.toThrow(
			"No member with email bob@example.com",
		);
	});
});
