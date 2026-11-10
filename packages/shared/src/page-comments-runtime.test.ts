import { describe, expect, test } from "bun:test";
import { createContext, runInContext } from "node:vm";
import {
	PAGE_COMMENTS_RUNTIME_SOURCE,
	PAGE_FIND_REFRESH_MS,
} from "./page-comments-runtime";

interface Posted {
	[key: string]: unknown;
	type: string;
}

function setup({ baseUrl = "https://page.example/view" } = {}) {
	const listeners = new Map<string, (event: unknown) => void>();
	const posted: Posted[] = [];
	let frames: (() => void)[] = [];
	let timers: { at: number; fn: () => void; id: number }[] = [];
	let now = 1_000_000;
	let nextTimerId = 1;
	const mutationCallbacks: ((records: { type: string }[]) => void)[] = [];

	const element = {
		getBoundingClientRect: () => ({
			top: 10,
			left: 10,
			width: 100,
			height: 20,
		}),
		nodeType: 1,
		parentElement: null,
		tagName: "P",
		id: "",
		className: "",
	};

	const context = createContext({
		URL,
		location: { href: "https://page.example/view" },
		scrollY: 0,
		scrollX: 0,
		innerWidth: 400,
		innerHeight: 800,
		document: {
			baseURI: baseUrl,
			documentElement: { style: {}, ...element },
			body: { ...element },
			addEventListener: (type: string, fn: (event: unknown) => void) =>
				listeners.set(`document:${type}`, fn),
			querySelectorAll: () => [element],
			elementFromPoint: () => element,
		},
		addEventListener: (type: string, fn: (event: unknown) => void) =>
			listeners.set(type, fn),
		parent: {
			postMessage: (message: Posted) => posted.push(message),
		},
		requestAnimationFrame: (fn: () => void) => {
			frames.push(fn);
			return frames.length;
		},
		setTimeout: (fn: () => void, ms: number) => {
			const id = nextTimerId++;
			timers.push({ at: now + ms, fn, id });
			return id;
		},
		clearTimeout: (id: number) => {
			timers = timers.filter((timer) => timer.id !== id);
		},
		scrollTo: () => {},
		ResizeObserver: class {
			observe() {}
		},
		MutationObserver: class {
			constructor(callback: (records: { type: string }[]) => void) {
				mutationCallbacks.push(callback);
			}
			observe() {}
		},
		Date: { now: () => now },
	});

	runInContext(PAGE_COMMENTS_RUNTIME_SOURCE, context);

	const pump = () => {
		const pending = frames;
		frames = [];
		for (const frame of pending) frame();
	};

	const advance = (ms: number) => {
		now += ms;
		const due = timers.filter((timer) => timer.at <= now);
		timers = timers.filter((timer) => timer.at > now);
		for (const timer of due) timer.fn();
	};

	return {
		posted,
		configureLinks: (enabled = true, trusted = true) =>
			listeners.get("message")?.({
				source: trusted ? context.parent : {},
				data: {
					channel: "superset-comments/host",
					type: "set-link-handling",
					enabled,
				},
			}),
		commentMode: () =>
			listeners.get("message")?.({
				data: {
					channel: "superset-comments/host",
					type: "set-mode",
					enabled: true,
					locked: true,
				},
			}),
		clickLink: (
			href: string,
			options: {
				metaKey?: boolean;
				ctrlKey?: boolean;
				shiftKey?: boolean;
				button?: number;
				download?: boolean;
				defaultPrevented?: boolean;
				svg?: boolean;
				noAnchor?: boolean;
			} = {},
		) => {
			let prevented = false;
			const event = {
				button: 0,
				...options,
				target: {
					closest: () =>
						options.noAnchor
							? null
							: {
									href: options.svg
										? { baseVal: href }
										: new URL(href, baseUrl).href,
									getAttribute: () => href,
									hasAttribute: () => options.download ?? false,
								},
				},
				preventDefault: () => {
					prevented = true;
				},
				stopPropagation: () => {},
			};
			listeners.get(
				options.button === 1 ? "document:auxclick" : "document:click",
			)?.(event);
			return prevented;
		},
		advance,
		track: (count: number) => {
			listeners.get("message")?.({
				data: {
					channel: "superset-comments/host",
					type: "track",
					anchors: Array.from({ length: count }, (_, index) => ({
						id: `thread-${index}`,
						anchor: { path: [0] },
					})),
				},
			});
			pump();
		},
		/** One frame of a finger drag: the page moves, then the frame runs. */
		scrollFrame: (by = 8, ms = 16) => {
			context.scrollY += by;
			now += ms;
			listeners.get("scroll")?.({});
			pump();
		},
		send: (data: Record<string, unknown>, trusted = true) =>
			listeners.get("message")?.({
				source: trusted ? context.parent : {},
				data: { channel: "superset-comments/host", ...data },
			}),
		keydown: (event: Record<string, unknown>) => {
			let prevented = false;
			listeners.get("document:keydown")?.({
				preventDefault: () => {
					prevented = true;
				},
				stopPropagation: () => {},
				...event,
			});
			return prevented;
		},
		mutate: () => {
			for (const callback of mutationCallbacks) {
				callback([{ type: "characterData" }]);
			}
		},
		clear: () => posted.splice(0, posted.length),
	};
}

const FRAMES = 60;

describe("page comments runtime, scroll cost", () => {
	test("a page with no pins stays quiet while scrolling", () => {
		const page = setup();
		page.clear();

		for (let i = 0; i < FRAMES; i += 1) page.scrollFrame();

		// Every message here crosses a serialized bridge on mobile. One per
		// frame is what made scrolling jitter (SUPER-2331); throttling keeps a
		// second of dragging to a handful.
		expect(page.posted.length).toBeLessThanOrEqual(FRAMES / 4);
		expect(page.posted.every((message) => message.type === "scroll")).toBe(
			true,
		);
	});

	test("no pins means no rect measurement at all", () => {
		const page = setup();
		page.clear();

		for (let i = 0; i < FRAMES; i += 1) page.scrollFrame();

		expect(page.posted.some((message) => message.type === "rects")).toBe(false);
	});

	test("the final scroll position still lands after the drag stops", () => {
		const page = setup();
		page.clear();

		for (let i = 0; i < FRAMES; i += 1) page.scrollFrame();
		const duringDrag = page.posted.length;
		page.advance(500);

		expect(page.posted.length).toBeGreaterThan(duringDrag);
		expect(page.posted.at(-1)?.type).toBe("scroll");
	});

	test("a page with pins still reports every frame", () => {
		const page = setup();
		page.track(3);
		page.clear();

		for (let i = 0; i < FRAMES; i += 1) page.scrollFrame();

		const rects = page.posted.filter((message) => message.type === "rects");
		expect(rects.length).toBe(FRAMES);
	});
});

describe("page links", () => {
	test("prevents frame navigation and forwards the resolved URL and modifiers", () => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(
			page.clickLink("https://example.com/job", {
				metaKey: true,
				shiftKey: true,
			}),
		).toBe(true);
		expect(page.posted).toEqual([
			{
				channel: "superset-comments/frame",
				type: "link-click",
				url: "https://example.com/job",
				metaKey: true,
				ctrlKey: false,
				shiftKey: true,
			},
		]);
	});
	test("requires the parent to opt in", () => {
		const page = setup();
		expect(page.clickLink("https://example.com")).toBe(false);
		page.configureLinks(true, false);
		expect(page.clickLink("https://example.com")).toBe(false);
		page.configureLinks();
		expect(page.clickLink("https://example.com")).toBe(true);
		page.configureLinks(false);
		expect(page.clickLink("https://example.com")).toBe(false);
	});
	test("keeps local anchors, downloads, and unsupported schemes in the page", () => {
		const page = setup();
		page.configureLinks();
		page.clear();
		for (const href of [
			"#section",
			"javascript:void(0)",
			"data:text/html,test",
		]) {
			expect(page.clickLink(href)).toBe(false);
		}
		expect(page.clickLink("https://example.com/file", { download: true })).toBe(
			false,
		);
		expect(page.posted).toEqual([]);
	});
	test("forwards relative URLs, middle clicks, and external protocols", () => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(page.clickLink("/other", { button: 1, ctrlKey: true })).toBe(true);
		expect(page.posted[0]).toMatchObject({
			url: "https://page.example/other",
			ctrlKey: true,
		});
		expect(page.clickLink("mailto:hello@example.com")).toBe(true);
		expect(page.clickLink("tel:123")).toBe(true);
	});
	test("comment selection never opens links", () => {
		const page = setup();
		page.configureLinks();
		page.commentMode();
		page.clear();
		expect(page.clickLink("https://example.com")).toBe(true);
		expect(page.clickLink("https://example.com", { button: 1 })).toBe(true);
		expect(page.posted).toEqual([]);
	});
});

describe("page link edge cases", () => {
	test.each([
		"#",
		"#section",
		" # ",
		"/view#",
		"https://page.example/view#",
		"https://page.example/view#section",
	])("keeps same-document anchor %s in the frame", (href) => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(page.clickLink(href)).toBe(false);
		expect(page.posted).toEqual([]);
	});
	test.each(["", "  "])("keeps empty href %j in the frame", (href) => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(page.clickLink(href)).toBe(false);
		expect(page.posted).toEqual([]);
	});
	test("resolves links against the document base, including SVG anchors", () => {
		const page = setup({ baseUrl: "https://other.example/docs/" });
		page.configureLinks();
		page.clear();
		expect(page.clickLink("guide", { svg: true })).toBe(true);
		expect(page.posted[0]).toMatchObject({
			url: "https://other.example/docs/guide",
		});
		expect(page.clickLink("#section")).toBe(true);
		expect(page.posted[1]).toMatchObject({
			url: "https://other.example/docs/#section",
		});
	});
	test.each([
		"/other#section",
		"/view?query=1#section",
		"//other.example/view#",
		"https://page.example/view%23section",
	])("forwards distinct document %s", (href) => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(page.clickLink(href)).toBe(true);
		expect(page.posted).toHaveLength(1);
	});
	test("ignores malformed URLs", () => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(page.clickLink("http://[", { svg: true })).toBe(false);
		expect(page.posted).toEqual([]);
	});
	test("ignores cancelled events, right clicks, and non-link targets", () => {
		const page = setup();
		page.configureLinks();
		page.clear();
		expect(
			page.clickLink("https://example.com", { defaultPrevented: true }),
		).toBe(false);
		expect(page.clickLink("https://example.com", { button: 2 })).toBe(false);
		expect(page.clickLink("https://example.com", { noAnchor: true })).toBe(
			false,
		);
		expect(page.posted).toEqual([]);
	});
});

describe("page find bridge", () => {
	test("announces find in every ready", () => {
		const page = setup();
		expect(page.posted[0]).toMatchObject({ type: "ready", features: ["find"] });
		page.clear();
		page.send({ type: "ready" });
		expect(page.posted).toEqual([
			{ channel: "superset-comments/frame", type: "ready", features: ["find"] },
		]);
	});

	test("forwards only the chords the parent asked for", () => {
		const page = setup();
		const findKey = { key: "f", code: "KeyF", metaKey: true };
		page.clear();
		expect(page.keydown(findKey)).toBe(false);

		page.send({ type: "set-find-chords", chords: ["meta+f"] }, false);
		expect(page.keydown(findKey)).toBe(false);

		page.send({ type: "set-find-chords", chords: ["meta+f"] });
		expect(page.keydown({ ...findKey, shiftKey: true })).toBe(false);
		expect(page.keydown(findKey)).toBe(true);
		expect(page.posted).toEqual([
			{ channel: "superset-comments/frame", type: "find-shortcut" },
		]);
	});

	test("answers a search from the parent only", () => {
		const page = setup();
		page.clear();
		page.send({ type: "find", query: "anything" }, false);
		expect(page.posted).toEqual([]);

		page.send({ type: "find", query: "anything" });
		expect(page.posted).toEqual([
			{
				channel: "superset-comments/frame",
				type: "find-result",
				query: "anything",
				total: 0,
				index: -1,
				capped: false,
			},
		]);
	});

	test("re-runs an open search after the page changes", () => {
		const page = setup();
		page.mutate();
		page.advance(PAGE_FIND_REFRESH_MS);
		page.send({ type: "find", query: "anything" });
		page.clear();

		page.mutate();
		page.mutate();
		page.advance(PAGE_FIND_REFRESH_MS - 1);
		expect(page.posted.filter((m) => m.type === "find-result")).toEqual([]);
		page.advance(1);
		expect(page.posted.filter((m) => m.type === "find-result")).toHaveLength(1);

		page.send({ type: "find-clear" });
		page.clear();
		page.mutate();
		page.advance(PAGE_FIND_REFRESH_MS);
		expect(page.posted.filter((m) => m.type === "find-result")).toEqual([]);
	});
});
