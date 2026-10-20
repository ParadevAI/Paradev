import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
	findTranscriberBinary,
	parseTranscriberOutput,
	transcribeNatively,
} from "./native-transcriber";

describe("findTranscriberBinary", () => {
	test("uses the packaged copy in a release build", () => {
		expect(
			findTranscriberBinary({
				platform: "darwin",
				isPackaged: true,
				resourcesPath: "/App/Contents/Resources",
				appPath: "/unused",
				exists: () => true,
			}),
		).toBe("/App/Contents/Resources/resources/bin/superset-transcriber");
	});

	test("is absent off macOS and when the build skipped it", () => {
		const options = {
			isPackaged: false,
			resourcesPath: "/r",
			appPath: "/repo/apps/desktop",
		};
		expect(
			findTranscriberBinary({
				...options,
				platform: "linux",
				exists: () => true,
			}),
		).toBeNull();
		expect(
			findTranscriberBinary({
				...options,
				platform: "darwin",
				exists: () => false,
			}),
		).toBeNull();
	});
});

describe("parseTranscriberOutput", () => {
	test("reads the text or the error from the last line", () => {
		expect(parseTranscriberOutput('noise\n{"text":"ship it"}\n')).toEqual({
			ok: true,
			text: "ship it",
		});
		expect(
			parseTranscriberOutput(
				'{"error":"unsupported-locale","message":"no model"}',
			),
		).toEqual({ ok: false, error: "unsupported-locale", message: "no model" });
		expect(parseTranscriberOutput("Segmentation fault").ok).toBe(false);
	});
});

describe("transcribeNatively", () => {
	test("hands the helper a temp file with the clip and removes it after", async () => {
		let seen: { path: string; bytes: Uint8Array; timeout: number } | undefined;
		const result = await transcribeNatively({
			binary: "/bin/transcriber",
			wav: new Uint8Array([1, 2, 3]),
			timeoutMs: 50,
			run: async (_file, args, options) => {
				const clip = args[0] ?? "";
				seen = {
					path: clip,
					bytes: new Uint8Array(readFileSync(clip)),
					timeout: options.timeout,
				};
				return { stdout: '{"text":"hello"}' };
			},
		});
		expect(result).toEqual({ ok: true, text: "hello" });
		expect(seen?.bytes).toEqual(new Uint8Array([1, 2, 3]));
		expect(seen?.timeout).toBe(50);
		expect(existsSync(seen?.path ?? "")).toBe(false);
	});

	test("reports a helper that crashed or timed out as a failure", async () => {
		const result = await transcribeNatively({
			binary: "/bin/transcriber",
			wav: new Uint8Array([1]),
			run: async () => {
				throw new Error("killed");
			},
		});
		expect(result).toEqual({ ok: false, error: "failed", message: "killed" });
	});
});
