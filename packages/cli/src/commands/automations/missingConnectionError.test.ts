import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../../lib/api-client";
import {
	assertTriggersConnected,
	missingConnectionError,
} from "./missingConnectionError";

const linear = { config: { kind: "linear" } };
const slack = { config: { kind: "slack" } };
const live = { connected: true, needsReauth: false };

describe("missingConnectionError", () => {
	it("refuses a trigger whose integration the caller has not connected", () => {
		const error = missingConnectionError([linear], {});
		expect(error?.message).toContain("you have not connected Linear");
		expect(error?.suggestion).toContain("Connect Linear in Settings");
	});

	it("asks for a reconnect when the connection expired", () => {
		const error = missingConnectionError([linear], {
			linear: { connected: false, needsReauth: true },
		});
		expect(error?.message).toContain("your Linear connection expired");
		expect(error?.suggestion).toContain("Reconnect Linear");
	});

	it("refuses a pin to an expired account while another account is live", () => {
		const error = missingConnectionError([{ ...linear, connectionId: "old" }], {
			linear: {
				...live,
				accounts: [
					{ id: "old", needsReauth: true },
					{ id: "new", needsReauth: false },
				],
			},
		});
		expect(error?.message).toContain("your Linear connection expired");
	});

	it("refuses a pin to an account the caller does not own", () => {
		const error = missingConnectionError(
			[{ ...linear, connectionId: "theirs" }],
			{ linear: { ...live, accounts: [{ id: "mine", needsReauth: false }] } },
		);
		expect(error?.message).toContain("pinned to an account");
	});

	it("allows a pin to a live account", () => {
		expect(
			missingConnectionError([{ ...linear, connectionId: "mine" }], {
				linear: { ...live, accounts: [{ id: "mine", needsReauth: false }] },
			}),
		).toBeNull();
	});

	it("allows a trigger whose integration is connected", () => {
		expect(missingConnectionError([linear], { linear: live })).toBeNull();
	});

	it("names every missing integration once", () => {
		const error = missingConnectionError([linear, linear, slack], {});
		expect(error?.message).toBe(
			"These triggers would never fire: you have not connected Linear; you have not connected Slack",
		);
	});

	it("ignores triggers that need no connection", () => {
		expect(
			missingConnectionError(
				[{ config: { kind: "schedule" } }, { config: { kind: "github" } }],
				{},
			),
		).toBeNull();
	});
});

describe("assertTriggersConnected", () => {
	const api = (query: () => Promise<unknown>) =>
		({ integration: { connectionStatus: { query } } }) as unknown as ApiClient;

	it("throws when the status names a missing connection", async () => {
		await expect(
			assertTriggersConnected(
				api(async () => ({})),
				"org",
				[linear],
			),
		).rejects.toThrow("you have not connected Linear");
	});

	it("lets the save go ahead when the status query fails", async () => {
		await expect(
			assertTriggersConnected(
				api(async () => {
					throw new Error("offline");
				}),
				"org",
				[linear],
			),
		).resolves.toBeUndefined();
	});
});
