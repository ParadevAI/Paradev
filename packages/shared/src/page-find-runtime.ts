export const PAGE_FIND_MATCH_CAP = 1000;

export const PAGE_FIND_MATCH_HIGHLIGHT = "superset-find-match";
export const PAGE_FIND_CURRENT_HIGHLIGHT = "superset-find-current";

export interface PageFindResult {
	query: string;
	total: number;
	/** The current match's position from 0; -1 while there is none. */
	index: number;
	/** More matches exist than the {@link PAGE_FIND_MATCH_CAP} that were kept. */
	capped: boolean;
}

export const PAGE_FIND_RUNTIME_SOURCE = `(onResult = () => {}) => {
	const MATCH = ${JSON.stringify(PAGE_FIND_MATCH_HIGHLIGHT)};
	const CURRENT = ${JSON.stringify(PAGE_FIND_CURRENT_HIGHLIGHT)};
	const CAP = ${PAGE_FIND_MATCH_CAP};
	const SKIP = new Set(["script", "style", "noscript", "template", "head", "title", "textarea", "select", "iframe", "object", "embed", "canvas", "video", "audio"]);
	const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "tspan", "textPath"]);

	let query = "";
	let ranges = [];
	let index = -1;
	let capped = false;
	let sheet = null;

	const fold = (text) => {
		let out = "";
		const map = [];
		let space = false;
		for (let i = 0; i < text.length; ) {
			const ch = String.fromCodePoint(text.codePointAt(i));
			if (/\\s/.test(ch)) {
				if (!space) { out += " "; map.push(i); }
				space = true;
				i += ch.length;
				continue;
			}
			space = false;
			const lower = ch.toLowerCase();
			const unit = lower.length === ch.length ? lower : ch;
			for (let k = 0; k < unit.length; k++) map.push(i + k);
			out += unit;
			i += ch.length;
		}
		return { out, map };
	};

	const hiddenSubtree = (el) =>
		typeof el.checkVisibility === "function" &&
		!el.checkVisibility() &&
		getComputedStyle(el).display !== "contents";

	const textRuns = () => {
		const runs = [];
		const shown = new Map();
		let run = null;
		const textShown = (el) => {
			let value = shown.get(el);
			if (value === undefined) {
				value = getComputedStyle(el).visibility === "visible";
				shown.set(el, value);
			}
			return value;
		};
		const walk = (node) => {
			for (let child = node.firstChild; child; child = child.nextSibling) {
				if (child.nodeType === 3) {
					if (!child.data || !textShown(node)) continue;
					if (!run) { run = { text: "", nodes: [] }; runs.push(run); }
					run.nodes.push({ node: child, start: run.text.length });
					run.text += child.data;
					continue;
				}
				if (child.nodeType !== 1 || SKIP.has(child.localName)) continue;
				const inline = INLINE.has(child.localName);
				if (!inline) run = null;
				if (!hiddenSubtree(child)) walk(child);
				if (!inline) run = null;
			}
		};
		if (document.body) walk(document.body);
		return runs;
	};

	const entryAt = (run, offset) => {
		let low = 0;
		let high = run.nodes.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (run.nodes[mid].start <= offset) low = mid;
			else high = mid - 1;
		}
		return run.nodes[low];
	};

	const rangeIn = (run, from, to) => {
		const start = entryAt(run, from);
		const end = entryAt(run, to - 1);
		const range = document.createRange();
		range.setStart(start.node, from - start.start);
		range.setEnd(end.node, to - end.start);
		return range;
	};

	const collect = () => {
		ranges = [];
		capped = false;
		const needle = fold(query).out;
		for (const run of textRuns()) {
			const { out, map } = fold(run.text);
			for (let at = out.indexOf(needle); at !== -1; at = out.indexOf(needle, at + needle.length)) {
				if (ranges.length === CAP) { capped = true; return; }
				ranges.push(rangeIn(run, map[at], map[at + needle.length - 1] + 1));
			}
		}
	};

	const canPaint = () =>
		typeof CSS !== "undefined" && Boolean(CSS.highlights) && typeof Highlight === "function";

	const paint = () => {
		if (!canPaint()) return;
		if (!sheet && typeof CSSStyleSheet === "function" && document.adoptedStyleSheets) {
			sheet = new CSSStyleSheet();
			sheet.replaceSync(
				"::highlight(" + MATCH + "){background-color:#fde047;color:#000}" +
				"::highlight(" + CURRENT + "){background-color:#f97316;color:#000}",
			);
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
		}
		const all = new Highlight();
		for (const range of ranges) all.add(range);
		CSS.highlights.set(MATCH, all);
		const current = ranges[index];
		if (!current) { CSS.highlights.delete(CURRENT); return; }
		const highlight = new Highlight(current);
		highlight.priority = 1;
		CSS.highlights.set(CURRENT, highlight);
	};

	const inView = (rect) =>
		rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;

	const reveal = () => {
		const range = ranges[index];
		if (!range || inView(range.getBoundingClientRect())) return;
		range.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
		const rect = range.getBoundingClientRect();
		if (inView(rect)) return;
		scrollBy({ top: rect.top - innerHeight / 2, behavior: "instant" });
	};

	const report = () => onResult({ query, total: ranges.length, index, capped });

	const clear = () => {
		query = "";
		ranges = [];
		index = -1;
		capped = false;
		if (!canPaint()) return;
		CSS.highlights.delete(MATCH);
		CSS.highlights.delete(CURRENT);
	};

	return {
		active: () => query !== "",
		search(next) {
			const text = typeof next === "string" ? next : "";
			if (!text.trim()) { clear(); report(); return; }
			query = text;
			collect();
			const below = ranges.findIndex((range) => range.getBoundingClientRect().bottom > 0);
			index = ranges.length === 0 ? -1 : Math.max(below, 0);
			paint();
			reveal();
			report();
		},
		step(delta) {
			if (ranges.length > 0) {
				index = (index + (delta < 0 ? -1 : 1) + ranges.length) % ranges.length;
				paint();
				reveal();
			}
			report();
		},
		refresh() {
			if (!query) return;
			collect();
			index = ranges.length === 0 ? -1 : Math.min(Math.max(index, 0), ranges.length - 1);
			paint();
			report();
		},
		clear,
	};
}`;
