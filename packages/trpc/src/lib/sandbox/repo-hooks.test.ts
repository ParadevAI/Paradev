import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
	readRepoHooks,
	repoHooksFromJson,
	repoHooksFromToml,
} from "./repo-hooks";

describe("repoHooksFromToml", () => {
	test("publishes only ports with preview = true", () => {
		expect(
			repoHooksFromToml(
				"[ports.web]\ndefault = 3000\npreview = true\n[ports.api]\ndefault = 3001\n",
			),
		).toEqual({ ports: [3000] });
	});

	test("a file without previews publishes nothing extra", () => {
		expect(repoHooksFromToml('[setup]\nrun = "x"\n')).toEqual({});
	});

	test("an invalid file is treated as missing", () => {
		expect(repoHooksFromToml("[setup\n")).toBeNull();
	});
});

describe("repoHooksFromJson", () => {
	test("publishes a v1 file's ports, through its conversion", () => {
		expect(
			repoHooksFromJson(JSON.stringify({ setup: ["x"], ports: [3000, 70000] })),
		).toEqual({ ports: [3000] });
	});

	test("unparseable JSON is treated as missing", () => {
		expect(repoHooksFromJson("{")).toBeNull();
	});
});

describe("readRepoHooks", () => {
	const args = { repo: { owner: "o", name: "r" }, branch: "main", token: null };

	afterEach(() => {
		(
			globalThis.fetch as unknown as { mockRestore?: () => void }
		).mockRestore?.();
	});

	function serve(files: Record<string, string>) {
		spyOn(globalThis, "fetch").mockImplementation((async (input: string) => {
			const path = new URL(input).pathname.split("/contents/")[1] ?? "";
			const text = files[path];
			return new Response(text ?? "", {
				status: text === undefined ? 404 : 200,
			});
		}) as unknown as typeof fetch);
	}

	test("falls back to the pre-rename .superset folder", async () => {
		serve({
			".superset/config.toml": "[ports.web]\ndefault = 3000\npreview = true\n",
		});

		expect(await readRepoHooks(args)).toEqual({ ports: [3000] });
	});

	test("prefers .paradev when it holds a config", async () => {
		serve({
			".paradev/config.toml": "[ports.web]\ndefault = 4000\npreview = true\n",
			".superset/config.toml": "[ports.web]\ndefault = 3000\npreview = true\n",
		});

		expect(await readRepoHooks(args)).toEqual({ ports: [4000] });
	});
});
