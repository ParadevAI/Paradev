import { describe, expect, it } from "bun:test";
import {
	createLinkPreviewLoader,
	type LinkPreviewDeps,
} from "./fetch-link-preview";
import { LinkPreviewUnavailableError } from "./public-url";

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);
const PAGE = "https://docs.example.com/guide";

type Route = (init: RequestInit) => Response | Promise<Response>;

const html = (body: string) => () =>
	new Response(body, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
const redirect = (location: string) => () =>
	new Response(null, { status: 302, headers: { location } });
const bytes = (body: Uint8Array, contentType: string) => () =>
	new Response(body, { headers: { "content-type": contentType } });

/** A loader over canned responses; any URL without one answers 404. */
function loaderFor(
	routes: Record<string, Route>,
	overrides: Partial<LinkPreviewDeps> = {},
) {
	const requested: string[] = [];
	const load = createLinkPreviewLoader({
		lookup: async () => ["93.184.216.34"],
		fetch: async (url, init) => {
			requested.push(url);
			return routes[url]?.(init) ?? new Response(null, { status: 404 });
		},
		...overrides,
	});
	return { load, requested };
}

describe("link preview fetch", () => {
	it("returns the title and the linked icon as a data URL", async () => {
		const sent: RequestInit[] = [];
		const { load } = loaderFor({
			[PAGE]: (init) => {
				sent.push(init);
				return html(
					`<title>Guide</title><link rel="icon" href="/static/icon.png">`,
				)();
			},
			"https://docs.example.com/static/icon.png": bytes(PNG, "image/png"),
		});
		expect(await load(PAGE)).toEqual({
			title: "Guide",
			iconDataUrl: `data:image/png;base64,${PNG.toString("base64")}`,
		});
		expect(sent[0]?.redirect).toBe("manual");
		expect(new Headers(sent[0]?.headers).get("user-agent")).toContain(
			"Superset",
		);
	});

	it("falls back to /favicon.ico and trusts the bytes over the declared type", async () => {
		const { load, requested } = loaderFor({
			[PAGE]: html(`<title>Guide</title><link rel="icon" href="/icon.png">`),
			"https://docs.example.com/icon.png": bytes(
				Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"/>`),
				"image/png",
			),
			"https://docs.example.com/favicon.ico": bytes(
				new Uint8Array([0, 0, 1, 0, 1, 0]),
				"application/octet-stream",
			),
		});
		expect((await load(PAGE)).iconDataUrl).toStartWith(
			"data:image/x-icon;base64,",
		);
		expect(requested).toEqual([
			PAGE,
			"https://docs.example.com/icon.png",
			"https://docs.example.com/favicon.ico",
		]);
	});

	it("keeps the title when no icon is usable", async () => {
		const { load } = loaderFor({
			[PAGE]: html("<title>Guide</title>"),
			"https://docs.example.com/favicon.ico": bytes(
				new Uint8Array(256 * 1024 + 1),
				"image/x-icon",
			),
		});
		expect(await load(PAGE)).toEqual({ title: "Guide", iconDataUrl: null });
	});

	it("follows a redirect and resolves the icon against the final URL", async () => {
		const { load, requested } = loaderFor({
			"https://example.com/g": redirect("https://docs.example.com/guide"),
			[PAGE]: html("<title>Guide</title>"),
			"https://docs.example.com/favicon.ico": bytes(PNG, "image/x-icon"),
		});
		expect((await load("https://example.com/g")).title).toBe("Guide");
		expect(requested.at(-1)).toBe("https://docs.example.com/favicon.ico");
	});

	it.each([
		["a loopback address", "http://127.0.0.1:8080/admin"],
		["a local host name", "http://localhost/admin"],
		["a URL with credentials", "https://user:secret@example.com/"],
		["another scheme", "file:///etc/passwd"],
	])("refuses a redirect to %s before requesting it", async (_name, target) => {
		const { load, requested } = loaderFor({ [PAGE]: redirect(target) });
		await expect(load(PAGE)).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);
		expect(requested).toEqual([PAGE]);
	});

	it("validates every hop against DNS, not only the first", async () => {
		const { load, requested } = loaderFor(
			{ [PAGE]: redirect("https://intranet.example.com/") },
			{
				lookup: async (host) =>
					host === "intranet.example.com" ? ["10.0.0.7"] : ["93.184.216.34"],
			},
		);
		await expect(load(PAGE)).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);
		expect(requested).toEqual([PAGE]);
	});

	it("gives up after five redirects", async () => {
		const hop = (n: number) => `https://example.com/${n}`;
		const { load, requested } = loaderFor(
			Object.fromEntries(
				Array.from({ length: 10 }, (_, n) => [hop(n), redirect(hop(n + 1))]),
			),
		);
		await expect(load(hop(0))).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);
		expect(requested).toHaveLength(6);
	});

	it("returns nothing for a page that is not HTML, and asks for no icon", async () => {
		const { load, requested } = loaderFor({
			[PAGE]: bytes(Buffer.from("%PDF-1.7"), "application/pdf"),
		});
		expect(await load(PAGE)).toEqual({ title: null, iconDataUrl: null });
		expect(requested).toEqual([PAGE]);
	});

	it("reads at most the first 512 KB of a page", async () => {
		const pulled: number[] = [];
		const chunk = new Uint8Array(64 * 1024).fill(0x20);
		const head = new TextEncoder().encode("<title>Long page</title>");
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled.push(chunk.byteLength);
				controller.enqueue(pulled.length === 1 ? head : chunk);
			},
		});
		const { load } = loaderFor({
			[PAGE]: () =>
				new Response(body, { headers: { "content-type": "text/html" } }),
		});
		expect((await load(PAGE)).title).toBe("Long page");
		expect(pulled.length).toBeLessThan(12);
	});

	it("rejects a failed status and a request that outlives its budget", async () => {
		const failed = loaderFor({});
		await expect(failed.load(PAGE)).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);

		const hung = loaderFor(
			{
				[PAGE]: (init) =>
					new Promise<Response>((_resolve, reject) => {
						init.signal?.addEventListener("abort", () =>
							reject(init.signal?.reason),
						);
					}),
			},
			{ timeoutMs: 5 },
		);
		await expect(hung.load(PAGE)).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);
	});

	it("loads a URL once, and tries again after a failure", async () => {
		let online = false;
		const { load, requested } = loaderFor({
			[PAGE]: () =>
				online
					? html("<title>Guide</title>")()
					: new Response(null, { status: 503 }),
		});
		await expect(load(PAGE)).rejects.toBeInstanceOf(
			LinkPreviewUnavailableError,
		);
		online = true;
		const [first, second] = await Promise.all([load(PAGE), load(` ${PAGE} `)]);
		expect(second).toBe(first);
		expect(await load(PAGE)).toBe(first);
		expect(requested.filter((url) => url === PAGE)).toHaveLength(2);
	});
});
