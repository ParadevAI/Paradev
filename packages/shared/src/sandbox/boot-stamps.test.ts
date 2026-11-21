import { describe, expect, it } from "bun:test";
import { parseBootStamps } from "./boot-stamps";

describe("parseBootStamps", () => {
	it("returns the stamps of the last boot in order, keeps a phase's detail out, and skips the runner's own lines", () => {
		const log = [
			"1789000000000 boot.start pid=1 bundle=abc",
			"1789000000100 host.exec",
			"1789000005000 boot.start pid=2 bundle=abc",
			"1789000005010 run.cleared",
			"1789000005020 setup apply-rootfs installed=0 skipped=26",
			"1789000005030 checkout.cloned https://github.com/superset-sh/superset.git",
			"1789000005900 host.exec 1.29.0",
			"",
		].join("\n");
		expect(parseBootStamps(log)).toEqual([
			{ phase: "boot.start", at: 1789000005000 },
			{ phase: "run.cleared", at: 1789000005010 },
			{ phase: "checkout.cloned", at: 1789000005030 },
			{ phase: "host.exec", at: 1789000005900 },
		]);
	});

	it("is empty for an empty or malformed log", () => {
		expect(parseBootStamps("")).toEqual([]);
		expect(parseBootStamps("not a stamp\n123 short\n")).toEqual([]);
	});
});
