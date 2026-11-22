import { describe, expect, test } from "bun:test";
import {
	isAllHostsOffered,
	resolveWorkspaceScope,
} from "./resolveWorkspaceScope";

const base = { hostsAnswered: true, cloudEnabled: true } as const;

describe("isAllHostsOffered", () => {
	test("offers All hosts for three or fewer places, Cloud included", () => {
		expect(isAllHostsOffered(2, true)).toBe(true);
		expect(isAllHostsOffered(3, true)).toBe(false);
		expect(isAllHostsOffered(3, false)).toBe(true);
		expect(isAllHostsOffered(1, false)).toBe(false);
	});
});

describe("resolveWorkspaceScope", () => {
	test("opens on All hosts with no saved choice when few places exist", () => {
		expect(resolveWorkspaceScope({ ...base, saved: null, hostCount: 2 })).toBe(
			"all",
		);
	});

	test("opens on the last host when there are too many places", () => {
		expect(resolveWorkspaceScope({ ...base, saved: null, hostCount: 3 })).toBe(
			"host",
		);
		expect(resolveWorkspaceScope({ ...base, saved: "all", hostCount: 5 })).toBe(
			"host",
		);
	});

	test("keeps a saved single host", () => {
		expect(
			resolveWorkspaceScope({ ...base, saved: "host", hostCount: 1 }),
		).toBe("host");
	});

	test("falls back to Cloud when the organization has no machine", () => {
		expect(resolveWorkspaceScope({ ...base, saved: null, hostCount: 0 })).toBe(
			"cloud",
		);
	});

	test("reads a saved Cloud pick as host when Cloud is off", () => {
		expect(
			resolveWorkspaceScope({
				...base,
				cloudEnabled: false,
				saved: "cloud",
				hostCount: 1,
			}),
		).toBe("host");
	});
});
