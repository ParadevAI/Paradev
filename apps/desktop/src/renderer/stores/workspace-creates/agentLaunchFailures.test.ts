import { describe, expect, test } from "bun:test";
import { agentLaunchFailureDetail } from "./agentLaunchFailures";

const UNKNOWN = "unknown error";

describe("agentLaunchFailureDetail", () => {
	test("returns null when no agents were reported", () => {
		expect(agentLaunchFailureDetail(undefined, UNKNOWN)).toBeNull();
		expect(agentLaunchFailureDetail([], UNKNOWN)).toBeNull();
	});

	test("returns null when every launch succeeded", () => {
		expect(
			agentLaunchFailureDetail(
				[{ ok: true }, { ok: true, error: "ignored" }],
				UNKNOWN,
			),
		).toBeNull();
	});

	test("reports a single host error", () => {
		expect(
			agentLaunchFailureDetail(
				[{ ok: false, error: "no agent config for `claude`" }],
				UNKNOWN,
			),
		).toBe("no agent config for `claude`");
	});

	test("joins every failed launch, not just the first", () => {
		expect(
			agentLaunchFailureDetail(
				[
					{ ok: false, error: "first failure" },
					{ ok: true },
					{ ok: false, error: "second failure" },
				],
				UNKNOWN,
			),
		).toBe("first failure; second failure");
	});

	test("falls back to the caller's stand-in when the host omitted a message", () => {
		expect(agentLaunchFailureDetail([{ ok: false }], UNKNOWN)).toBe(UNKNOWN);
	});
});
