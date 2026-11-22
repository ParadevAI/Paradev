import { describe, expect, test } from "bun:test";
import { shellFrameColor } from "./shellFrameColor";

describe("shellFrameColor", () => {
	test("mixes the foreground into the background like --shell-frame", async () => {
		const css = await Bun.file(
			`${import.meta.dir}/../../../../../../../globals.css`,
		).text();
		expect(css).toContain(
			"--shell-frame: color-mix(in oklab, var(--foreground) 15%, var(--background));",
		);
		expect(shellFrameColor("#000000", "#ffffff")).toBe("#0b0b0b");
		expect(shellFrameColor("#123456", "#123456")).toBe("#123456");
		expect(shellFrameColor("var(--x)", "#ffffff")).toBe("var(--x)");
	});
});
