import { describe, expect, test } from "bun:test";
import { macArch } from "./mac-arch";

describe("macArch", () => {
	test("an x64 app under Rosetta downloads the arm64 build", async () => {
		expect(await macArch("x64", async () => true)).toBe("arm64");
		expect(await macArch("x64", async () => false)).toBe("x64");
		expect(await macArch("arm64", async () => false)).toBe("arm64");
	});
});
