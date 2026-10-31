import { describe, expect, it } from "bun:test";
import { missingConnectionError } from "./missingConnectionError";

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
		expect(error?.suggestion).toContain("Reconnect Linear");
	});

	it("allows a trigger whose integration is connected", () => {
		expect(missingConnectionError([linear], { linear: live })).toBeNull();
	});

	it("names every missing integration once", () => {
		const error = missingConnectionError([linear, linear, slack], {});
		expect(error?.message).toContain("Linear, Slack");
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
