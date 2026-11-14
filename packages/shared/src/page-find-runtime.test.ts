import { describe, expect, test } from "bun:test";
import { createContext, runInContext } from "node:vm";
import {
	PAGE_FIND_CURRENT_HIGHLIGHT,
	PAGE_FIND_MATCH_CAP,
	PAGE_FIND_MATCH_HIGHLIGHT,
	PAGE_FIND_RUNTIME_SOURCE,
	type PageFindResult,
} from "./page-find-runtime";

interface FakeNode {
	nodeType: number;
	localName?: string;
	data?: string;
	style?: { display?: string; visibility?: string };
	top?: number;
	firstChild: FakeNode | null;
	nextSibling: FakeNode | null;
	parentElement: FakeNode | null;
	checkVisibility?: () => boolean;
	scrollIntoView?: () => void;
}

const VIEWPORT_HEIGHT = 800;

function text(data: string, top = 0): FakeNode {
	return {
		nodeType: 3,
		data,
		top,
		firstChild: null,
		nextSibling: null,
		parentElement: null,
	};
}

function el(
	localName: string,
	children: FakeNode[] = [],
	style: FakeNode["style"] = {},
): FakeNode {
	const node: FakeNode = {
		nodeType: 1,
		localName,
		style,
		firstChild: children[0] ?? null,
		nextSibling: null,
		parentElement: null,
	};
	node.checkVisibility = () => {
		for (let at: FakeNode | null = node; at; at = at.parentElement) {
			if (at.style?.display === "none") return false;
		}
		return true;
	};
	children.forEach((child, index) => {
		child.parentElement = node;
		child.nextSibling = children[index + 1] ?? null;
	});
	return node;
}

class FakeRange {
	startContainer: FakeNode | null = null;
	startOffset = 0;
	endContainer: FakeNode | null = null;
	endOffset = 0;
	setStart(node: FakeNode, offset: number) {
		this.startContainer = node;
		this.startOffset = offset;
	}
	setEnd(node: FakeNode, offset: number) {
		this.endContainer = node;
		this.endOffset = offset;
	}
	getBoundingClientRect() {
		const top = (this.startContainer?.top ?? 0) - scroll.y;
		return { top, bottom: top + 10, left: 0, right: 10 };
	}
}

const scroll = { y: 0 };

function setup(body: FakeNode) {
	const highlights = new Map<string, Set<FakeRange>>();
	const results: PageFindResult[] = [];
	const scrolledInto: FakeNode[] = [];
	scroll.y = 0;
	const visit = (node: FakeNode) => {
		if (node.nodeType === 1) {
			node.scrollIntoView = () => {
				scrolledInto.push(node);
				for (let child = node.firstChild; child; child = child.nextSibling) {
					if (child.nodeType === 3) scroll.y = (child.top ?? 0) - 100;
				}
			};
		}
		for (let child = node.firstChild; child; child = child.nextSibling) {
			visit(child);
		}
	};
	visit(body);

	const context = createContext({
		document: {
			body,
			createRange: () => new FakeRange(),
			adoptedStyleSheets: [],
		},
		getComputedStyle: (node: FakeNode) => {
			let visibility = "visible";
			for (let at: FakeNode | null = node; at; at = at.parentElement) {
				if (at.style?.visibility) {
					visibility = at.style.visibility;
					break;
				}
			}
			return { display: node.style?.display ?? "block", visibility };
		},
		CSS: { highlights },
		Highlight: class extends Set<FakeRange> {
			priority = 0;
			constructor(...ranges: FakeRange[]) {
				super(ranges);
			}
		},
		CSSStyleSheet: class {
			replaceSync() {}
		},
		innerHeight: VIEWPORT_HEIGHT,
		innerWidth: 1000,
		scrollBy: ({ top }: { top: number }) => {
			scroll.y += top;
		},
	});
	const find = runInContext(
		`(${PAGE_FIND_RUNTIME_SOURCE})`,
		context,
	)((result: PageFindResult) => results.push(result)) as {
		search: (query: string) => void;
		step: (delta: number) => void;
		refresh: () => void;
		clear: () => void;
	};
	const last = () => results.at(-1);
	const current = () =>
		[...(highlights.get(PAGE_FIND_CURRENT_HIGHLIGHT) ?? [])][0];
	return { find, highlights, last, current, scrolledInto };
}

describe("page find runtime", () => {
	test("matches case-insensitively across inline markup but not across blocks", () => {
		const page = setup(
			el("body", [
				el("p", [text("Hello "), el("b", [text("WOR")]), text("ld")]),
				el("p", [text("hello wor")]),
				el("p", [text("ld")]),
			]),
		);
		page.find.search("hello world");
		expect(page.last()).toEqual({
			query: "hello world",
			total: 1,
			index: 0,
			capped: false,
		});
		const range = page.current() as FakeRange;
		expect(range.startContainer?.data).toBe("Hello ");
		expect(range.startOffset).toBe(0);
		expect(range.endContainer?.data).toBe("ld");
		expect(range.endOffset).toBe(2);
	});

	test("skips text the reader cannot see", () => {
		const page = setup(
			el("body", [
				el("p", [text("needle")]),
				el("div", [text("needle")], { display: "none" }),
				el("div", [el("span", [text("needle")])], { visibility: "hidden" }),
				el("script", [text("needle")]),
				el("style", [text("needle")]),
			]),
		);
		page.find.search("needle");
		expect(page.last()?.total).toBe(1);
	});

	test("collapses whitespace the way the page renders it", () => {
		const page = setup(el("body", [el("p", [text("two\n    words")])]));
		page.find.search("two words");
		expect(page.last()?.total).toBe(1);
		expect((page.current() as FakeRange).endOffset).toBe(13);
	});

	test("next and previous wrap around and scroll the match into view", () => {
		const first = el("p", [text("cat", 100)]);
		const second = el("p", [text("cat", 2000)]);
		const page = setup(el("body", [first, second]));
		page.find.search("cat");
		expect(page.last()?.index).toBe(0);
		expect(page.scrolledInto).toEqual([]);

		page.find.step(1);
		expect(page.last()?.index).toBe(1);
		expect(page.scrolledInto).toEqual([second]);

		page.find.step(1);
		expect(page.last()?.index).toBe(0);
		page.find.step(-1);
		expect(page.last()?.index).toBe(1);
		expect(page.highlights.get(PAGE_FIND_MATCH_HIGHLIGHT)?.size).toBe(2);
	});

	test("starts at the first match not above the viewport", () => {
		const page = setup(
			el("body", [el("p", [text("cat", 100)]), el("p", [text("cat", 2000)])]),
		);
		scroll.y = 1500;
		page.find.search("cat");
		expect(page.last()?.index).toBe(1);
	});

	test("caps the matches it keeps and says so", () => {
		const page = setup(
			el("body", [el("p", [text("a".repeat(PAGE_FIND_MATCH_CAP + 5))])]),
		);
		page.find.search("a");
		expect(page.last()).toMatchObject({
			total: PAGE_FIND_MATCH_CAP,
			capped: true,
		});
	});

	test("refresh keeps the position, clamped to what is left", () => {
		const paragraph = el("p", [text("x x x")]);
		const page = setup(el("body", [paragraph]));
		page.find.search("x");
		page.find.step(1);
		page.find.step(1);
		expect(page.last()?.index).toBe(2);

		(paragraph.firstChild as FakeNode).data = "x x";
		page.find.refresh();
		expect(page.last()).toMatchObject({ total: 2, index: 1 });
	});

	test("an empty query and clear both remove every highlight", () => {
		const page = setup(el("body", [el("p", [text("dog")])]));
		page.find.search("dog");
		expect(page.highlights.size).toBe(2);

		page.find.search("   ");
		expect(page.highlights.size).toBe(0);
		expect(page.last()).toEqual({
			query: "",
			total: 0,
			index: -1,
			capped: false,
		});

		page.find.search("dog");
		page.find.clear();
		expect(page.highlights.size).toBe(0);
		page.find.refresh();
		expect(page.last()?.total).toBe(1);
	});
});
