import { describe, expect, test } from "bun:test";
import {
	compareVersions,
	findViolations,
	parseVersionNeeds,
} from "./check-linux-glibc";

const readelfOutput = `
Version definition section '.gnu.version_d' contains 1 entry:
  000000: Rev: 1  Flags: BASE  Index: 1  Cnt: 1  Name: GLIBC_2.99

Version needs section '.gnu.version_r' contains 2 entries:
 Addr: 0x0000000000000a30  Offset: 0x000a30  Link: 4 (.dynstr)
  000000: Version: 1  File: libstdc++.so.6  Cnt: 2
  0x0010:   Name: GLIBCXX_3.4.31  Flags: none  Version: 5
  0x0020:   Name: CXXABI_1.3  Flags: none  Version: 4
  0x0030: Version: 1  File: libc.so.6  Cnt: 2
  0x0040:   Name: GLIBC_2.42  Flags: none  Version: 3
  0x0050:   Name: GLIBC_2.2.5  Flags: none  Version: 2
`;

describe("check-linux-glibc", () => {
	test("compares dotted versions numerically", () => {
		expect(compareVersions("2.4", "2.35")).toBeLessThan(0);
		expect(compareVersions("3.4.31", "3.4.30")).toBeGreaterThan(0);
		expect(compareVersions("2.35", "2.35.0")).toBe(0);
	});

	test("reads needed versions and ignores the binary's own definitions", () => {
		expect(parseVersionNeeds(readelfOutput)).toEqual([
			{ library: "GLIBCXX", version: "3.4.31" },
			{ library: "GLIBC", version: "2.42" },
			{ library: "GLIBC", version: "2.2.5" },
		]);
	});

	test("reports each library whose highest need is above the floor", () => {
		expect(
			findViolations("pty.node", parseVersionNeeds(readelfOutput)),
		).toEqual([
			{ file: "pty.node", library: "GLIBCXX", version: "3.4.31" },
			{ file: "pty.node", library: "GLIBC", version: "2.42" },
		]);
		expect(
			findViolations("ok.node", [{ library: "GLIBC", version: "2.34" }]),
		).toEqual([]);
	});
});
