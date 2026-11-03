import { describe, expect, test } from "bun:test";
import { pickGithubStatus } from "./pickGithubStatus";

const NOW = 1_000;

const hold = (
	reason: "rate-limited" | "unreachable" | "auth",
	until = NOW + 60_000,
) => ({
	reason,
	since: 1,
	until,
});

describe("pickGithubStatus", () => {
	test("returns null when every host is healthy or predates the field", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "local", status: null },
					{ machineId: "remote", status: undefined },
				],
				"local",
				NOW,
			),
		).toBeNull();
	});

	test("prefers the local machine's hold over a remote one", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "remote", status: hold("unreachable") },
					{ machineId: "local", status: hold("rate-limited") },
				],
				"local",
				NOW,
			),
		).toEqual({ machineId: "local", status: hold("rate-limited") });
	});

	test("falls back to any remote hold when the local sweep is healthy", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "local", status: null },
					{ machineId: "remote", status: hold("auth") },
				],
				"local",
				NOW,
			),
		).toEqual({ machineId: "remote", status: hold("auth") });
	});

	test("skips a hold whose retry time has passed", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "local", status: hold("unreachable", NOW - 1) },
					{ machineId: "remote", status: hold("auth") },
				],
				"local",
				NOW,
			),
		).toEqual({ machineId: "remote", status: hold("auth") });
	});
});
