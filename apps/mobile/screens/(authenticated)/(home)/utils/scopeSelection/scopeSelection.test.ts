import { describe, expect, test } from "bun:test";
import {
	canTickHost,
	defaultSelection,
	resolveSelection,
	selectedHosts,
	selectionLabel,
	selectionScope,
	toggleCloud,
	toggleHost,
} from "./scopeSelection";

const host = (machineId: string, isOnline = true) => ({
	machineId,
	name: machineId.toUpperCase(),
	isOnline,
});
const four = [host("a", false), host("b"), host("c"), host("d")];

describe("defaultSelection", () => {
	test("ticks everything for three hosts or fewer", () => {
		expect(defaultSelection([host("b"), host("a")], true, true)).toEqual({
			hosts: ["a", "b"],
			cloud: true,
		});
	});

	test("ticks the first online host when there are more", () => {
		expect(defaultSelection(four, true, true)).toEqual({
			hosts: ["b"],
			cloud: false,
		});
	});

	test("lands on Cloud only once an empty roster has answered", () => {
		expect(defaultSelection([], true, true)).toEqual({
			hosts: [],
			cloud: true,
		});
		expect(defaultSelection([], true, false)).toEqual({
			hosts: [],
			cloud: false,
		});
	});
});

describe("resolveSelection", () => {
	const base = { hosts: four, cloudEnabled: true, hostsAnswered: true };

	test("drops a ticked host that no longer exists", () => {
		expect(
			resolveSelection({
				...base,
				saved: { hosts: ["gone", "c"], cloud: false },
			}),
		).toEqual({ hosts: ["c"], cloud: false });
	});

	test("falls back to the default when nothing valid remains", () => {
		expect(
			resolveSelection({ ...base, saved: { hosts: ["gone"], cloud: false } }),
		).toEqual({ hosts: ["b"], cloud: false });
	});

	test("drops Cloud where it is off", () => {
		expect(
			resolveSelection({
				...base,
				cloudEnabled: false,
				saved: { hosts: ["c"], cloud: true },
			}),
		).toEqual({ hosts: ["c"], cloud: false });
	});
});

describe("the cap", () => {
	const three = { hosts: ["a", "b", "c"], cloud: false };

	test("a fourth host can't be ticked; Cloud does not count", () => {
		expect(canTickHost(three, "d")).toBe(false);
		expect(toggleHost(three, "d")).toBe(three);
		expect(toggleCloud(three)).toEqual({ ...three, cloud: true });
	});

	test("the last ticked place stays ticked", () => {
		const one = { hosts: ["a"], cloud: false };
		expect(toggleHost(one, "a")).toBe(one);
		const cloudOnly = { hosts: [], cloud: true };
		expect(toggleCloud(cloudOnly)).toBe(cloudOnly);
	});
});

describe("selectionLabel", () => {
	test("names one place, says All hosts for everything, else counts places", () => {
		const hosts = [host("a"), host("b")];
		expect(selectionLabel({ hosts: ["a"], cloud: false }, hosts, true)).toEqual(
			{
				kind: "host",
				machineId: "a",
			},
		);
		expect(selectionLabel({ hosts: [], cloud: true }, hosts, true)).toEqual({
			kind: "cloud",
		});
		expect(
			selectionLabel({ hosts: ["a", "b"], cloud: true }, hosts, true),
		).toEqual({ kind: "all" });
		expect(selectionLabel({ hosts: ["a"], cloud: true }, hosts, true)).toEqual({
			kind: "count",
			count: 2,
		});
	});
});

describe("selectionScope", () => {
	test("one place renders as that place, more as labelled places", () => {
		expect(selectionScope({ hosts: ["a"], cloud: false })).toBe("host");
		expect(selectionScope({ hosts: [], cloud: true })).toBe("cloud");
		expect(selectionScope({ hosts: ["a"], cloud: true })).toBe("multi");
	});

	test("lists only the ticked hosts, by name", () => {
		expect(
			selectedHosts(four, { hosts: ["d", "b"], cloud: false }).map(
				(h) => h.machineId,
			),
		).toEqual(["b", "d"]);
	});
});
