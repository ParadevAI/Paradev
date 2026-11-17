import { beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bundleManifest,
	MANIFEST,
	resolveBundle,
	sha256,
	verifiedBundle,
} from "./boot.ts";

const enc = (s: string) => new TextEncoder().encode(s);

function bundle(runner: string) {
	const files = {
		"runner.js": enc(runner),
		"cli.js": enc("// cli"),
		"photon_rs_bg.wasm": enc("wasm"),
	};
	return { files, ...bundleManifest(files) };
}

function writeBundle(dir: string, b: ReturnType<typeof bundle>) {
	mkdirSync(dir, { recursive: true });
	for (const [name, bytes] of Object.entries(b.files))
		writeFileSync(join(dir, name), bytes);
	writeFileSync(join(dir, MANIFEST), b.bytes);
}

/** The API's `/box-artifacts/<sha>`: a bundle's manifest or one of its files, by sha256. */
function artifactApi(
	served: ReturnType<typeof bundle>[],
	opts: { corrupt?: string } = {},
) {
	const requests: string[] = [];
	const bySha = new Map<string, Uint8Array>();
	for (const b of served) {
		bySha.set(b.sha, b.bytes);
		for (const bytes of Object.values(b.files)) bySha.set(sha256(bytes), bytes);
	}
	const fetchFn = (async (url: string) => {
		const sha = url.split("/").at(-1)!;
		requests.push(sha);
		const bytes = bySha.get(sha);
		if (!bytes) return new Response("not found", { status: 404 });
		return new Response(sha === opts.corrupt ? enc("tampered") : bytes);
	}) as unknown as typeof fetch;
	return { fetch: fetchFn, requests };
}

let root: string;
let image: ReturnType<typeof bundle>;
let next: ReturnType<typeof bundle>;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "dev-boot-"));
	image = bundle("// runner v1");
	next = bundle("// runner v2");
	writeBundle(join(root, "opt"), image);
});
const input = (
	want: string | undefined,
	api: ReturnType<typeof artifactApi>,
) => ({
	builtinDir: join(root, "opt"),
	want,
	cacheDir: join(root, "agent/.dev/runner"),
	apiUrl: "http://api.test/",
	fetch: api.fetch,
});

describe("bundle ids", () => {
	test("the same files make the same id, whatever their order; any change makes another", () => {
		const a = bundleManifest({ "runner.js": enc("x"), "cli.js": enc("y") });
		const b = bundleManifest({ "cli.js": enc("y"), "runner.js": enc("x") });
		expect(a.sha).toBe(b.sha);
		expect(a.sha).toBe(sha256(a.bytes));
		expect(
			bundleManifest({ "runner.js": enc("x!"), "cli.js": enc("y") }).sha,
		).not.toBe(a.sha);
	});

	test("a folder verifies only while every file matches its manifest", async () => {
		const dir = join(root, "check");
		writeBundle(dir, next);
		expect(await verifiedBundle(dir)).toBe(next.sha);
		writeFileSync(join(dir, "runner.js"), "// edited");
		expect(await verifiedBundle(dir)).toBeNull();
		expect(await verifiedBundle(join(root, "missing"))).toBeNull();
	});
});

describe("resolveBundle", () => {
	test("no sha asked for, or the image's own: the image's bundle, nothing fetched", async () => {
		const api = artifactApi([next]);
		expect(await resolveBundle(input(undefined, api))).toEqual({
			dir: join(root, "opt"),
			sha: image.sha,
			source: "image",
		});
		expect((await resolveBundle(input(image.sha, api))).source).toBe("image");
		expect(api.requests).toEqual([]);
	});

	test("another bundle is downloaded once, reusing the image's unchanged files, then served from the cache", async () => {
		const api = artifactApi([next]);
		const first = await resolveBundle(input(next.sha, api));
		expect(first).toEqual({
			dir: join(root, "agent/.dev/runner", next.sha),
			sha: next.sha,
			source: "download",
		});
		expect(readFileSync(join(first.dir, "runner.js"), "utf8")).toBe(
			"// runner v2",
		);
		// The manifest and the changed runner.js; cli.js and the wasm match the image's and are copied from it.
		expect(api.requests).toEqual([next.sha, sha256(next.files["runner.js"])]);
		api.requests.length = 0;
		expect((await resolveBundle(input(next.sha, api))).source).toBe("cache");
		expect(api.requests).toEqual([]);
	});

	test("a newer bundle replaces the cached one", async () => {
		const third = bundle("// runner v3");
		const api = artifactApi([next, third]);
		await resolveBundle(input(next.sha, api));
		await resolveBundle(input(third.sha, api));
		expect(readdirSync(join(root, "agent/.dev/runner"))).toEqual([third.sha]);
	});

	test("a damaged cache is fetched again", async () => {
		const api = artifactApi([next]);
		const { dir } = await resolveBundle(input(next.sha, api));
		writeFileSync(join(dir, "runner.js"), "// half written");
		const again = await resolveBundle(input(next.sha, api));
		expect(again.source).toBe("download");
		expect(readFileSync(join(again.dir, "runner.js"), "utf8")).toBe(
			"// runner v2",
		);
	});

	test("falls back to the image's bundle when the API fails, or answers bytes that don't match, leaving no partial cache", async () => {
		const down = await resolveBundle(input(next.sha, artifactApi([])));
		expect(down).toMatchObject({
			dir: join(root, "opt"),
			sha: image.sha,
			source: "image",
		});
		expect(down.fallback).toContain("404");

		const tampered = await resolveBundle(
			input(
				next.sha,
				artifactApi([next], { corrupt: sha256(next.files["runner.js"]) }),
			),
		);
		expect(tampered.source).toBe("image");
		expect(tampered.fallback).toContain("doesn't match");
		expect(readdirSync(join(root, "agent/.dev/runner"))).toEqual([]);

		const unreachable = {
			...input(next.sha, artifactApi([next])),
			fetch: (async () =>
				Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch,
		};
		expect((await resolveBundle(unreachable)).fallback).toContain(
			"ECONNREFUSED",
		);
	});

	test("a manifest can only name plain files in its own folder", async () => {
		const evil = enc(
			JSON.stringify({
				files: {
					"../../etc/x": sha256(enc("x")),
					"runner.js": sha256(next.files["runner.js"]),
					"cli.js": sha256(enc("// cli")),
				},
			}),
		);
		const sha = sha256(evil);
		const api = {
			fetch: (async () => new Response(evil)) as unknown as typeof fetch,
			requests: [],
		};
		const res = await resolveBundle(input(sha, api));
		expect(res.source).toBe("image");
		expect(res.fallback).toContain("bad manifest entry");
	});
});
