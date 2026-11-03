import { describe, expect, it } from "bun:test";
import {
	createLinkPreviewLoader,
	EMPTY_LINK_PREVIEW,
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
	const loader = createLinkPreviewLoader({
		lookup: async () => ["93.184.216.34"],
		fetch: async (url, init) => {
			requested.push(url);
			return routes[url]?.(init) ?? new Response(null, { status: 404 });
		},
		...overrides,
	});
	const load = (url: string, image = false) => loader({ url, image });
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
			description: null,
			iconDataUrl: `data:image/png;base64,${PNG.toString("base64")}`,
			image: null,
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
		expect(await load(PAGE)).toMatchObject({
			title: "Guide",
			iconDataUrl: null,
		});
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
		expect(await load(PAGE)).toEqual(EMPTY_LINK_PREVIEW);
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

	it("returns the description, and the preview image only when asked", async () => {
		const page = html(
			`<title>Guide</title><meta name="description" content="How to start">` +
				`<meta property="og:image" content="/static/card.png">`,
		);
		const { load, requested } = loaderFor({
			[PAGE]: page,
			"https://docs.example.com/static/card.png": bytes(PNG, "image/png"),
		});
		const withoutImage = await load(PAGE);
		expect(withoutImage.description).toBe("How to start");
		expect(withoutImage.image).toBeNull();
		expect(requested).not.toContain("https://docs.example.com/static/card.png");

		expect((await load(PAGE, true)).image).toEqual({
			dataUrl: `data:image/png;base64,${PNG.toString("base64")}`,
			width: 1,
			height: 1,
		});
	});

	it("drops a preview image that is not a supported picture", async () => {
		const { load } = loaderFor({
			[PAGE]: html(
				`<title>Guide</title><meta property="og:image" content="/card.ico">`,
			),
			"https://docs.example.com/card.ico": bytes(
				new Uint8Array([0, 0, 1, 0, 1, 0]),
				"image/png",
			),
		});
		expect(await load(PAGE, true)).toMatchObject({
			title: "Guide",
			image: null,
		});
	});

	it("stops reading the page at the end of its head", async () => {
		let pulls = 0;
		const head = new TextEncoder().encode(
			"<html><head><title>Guide</title></HEAD>",
		);
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				controller.enqueue(
					pulls === 1 ? head : new Uint8Array(1024).fill(0x20),
				);
			},
		});
		const { load } = loaderFor({
			[PAGE]: () =>
				new Response(body, { headers: { "content-type": "text/html" } }),
		});
		expect((await load(PAGE)).title).toBe("Guide");
		expect(pulls).toBeLessThan(3);
	});

	it("keeps only the 20 most recent previews with images", async () => {
		const routes: Record<string, Route> = {};
		for (let i = 0; i <= 20; i++) {
			routes[`https://docs.example.com/p${i}`] = html(
				`<title>Page ${i}</title>`,
			);
		}
		const { load, requested } = loaderFor(routes);
		for (let i = 0; i <= 20; i++)
			await load(`https://docs.example.com/p${i}`, true);
		await load("https://docs.example.com/p20", true);
		await load("https://docs.example.com/p0", true);
		const fetches = (url: string) => requested.filter((r) => r === url).length;
		expect(fetches("https://docs.example.com/p20")).toBe(1);
		expect(fetches("https://docs.example.com/p0")).toBe(2);
	});

	it("does not stop at a </head inside a script", async () => {
		const { load } = loaderFor({
			[PAGE]: html(
				'<head><script>var s = "</head>";</script><meta property="og:title" content="Real title"></head>',
			),
		});
		expect((await load(PAGE)).title).toBe("Real title");
	});
});
