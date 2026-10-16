import DOMPurify from "dompurify";

/** Where clients put the quoted earlier message; Gmail folds these behind "•••". */
const QUOTE_SELECTORS = [
	".gmail_quote",
	"blockquote[type=cite]",
	"#divRplyFwdMsg",
	"#appendonsend",
	".yahoo_quoted",
	".moz-cite-prefix",
];
const FORWARD_MARK = /^-+\s*Forwarded message/i;

export interface EmailHtml {
	full: string;
	/** Without the trailing quote, or null when there is none to fold. */
	trimmed: string | null;
	/** Laid out by its sender with its own colors and widths, so it keeps a light page, as Gmail shows it. */
	designed: boolean;
}

function isForward(node: Element): boolean {
	const attr = node.querySelector(".gmail_attr");
	return FORWARD_MARK.test(
		(attr?.textContent ?? node.textContent ?? "").trim(),
	);
}

function outermostQuotes(doc: Document): Element[] {
	const found = doc.querySelectorAll(QUOTE_SELECTORS.join(","));
	return [...found].filter(
		(node) =>
			!isForward(node) &&
			!node.parentElement?.closest(QUOTE_SELECTORS.join(",")),
	);
}

function looksDesigned(doc: Document): boolean {
	return Boolean(
		doc.querySelector(
			"table[width], table[bgcolor], td[bgcolor], [style*='background'], body[bgcolor], center",
		),
	);
}

function isBlank(node: Node): boolean {
	if (node.nodeType === Node.TEXT_NODE) return !node.textContent?.trim();
	if (!(node instanceof Element)) return true;
	if (node.matches("img, table, hr, video")) return false;
	return (
		!node.textContent?.trim() && !node.querySelector("img, table, hr, video")
	);
}

/** Gmail drops the empty lines a reply leaves above the quote it folds away. */
function trimTrailingBlank(element: Element): void {
	let last = element.lastChild;
	while (last && isBlank(last)) {
		element.removeChild(last);
		last = element.lastChild;
	}
	if (last instanceof Element && !last.matches("img, table, hr, video"))
		trimTrailingBlank(last);
}

/** The sender's HTML made safe to draw: no scripts, frames, forms or remote stylesheets. */
export function prepareEmailHtml(html: string): EmailHtml {
	const clean = DOMPurify.sanitize(html, {
		WHOLE_DOCUMENT: true,
		FORBID_TAGS: [
			"script",
			"iframe",
			"object",
			"embed",
			"form",
			"base",
			"meta",
			"link",
			"input",
			"button",
			"textarea",
			"select",
		],
		FORBID_ATTR: ["srcset", "target"],
	});
	const doc = new DOMParser().parseFromString(clean, "text/html");
	for (const link of doc.querySelectorAll("a[href], area[href]")) {
		link.setAttribute("target", "_blank");
		link.setAttribute("rel", "noopener noreferrer");
	}
	const designed = looksDesigned(doc);
	const full = doc.documentElement.outerHTML;
	const quotes = outermostQuotes(doc);
	if (quotes.length === 0) return { full, trimmed: null, designed };
	for (const quote of quotes) quote.remove();
	trimTrailingBlank(doc.body);
	return { full, trimmed: doc.documentElement.outerHTML, designed };
}

/** A plain-text body split where its quoted reply begins: the "On … wrote:" line or the first run of `>` lines. */
export function splitQuotedText(text: string): {
	body: string;
	quoted: string | null;
} {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const at = lines.findIndex(
		(line, i) =>
			(/^On .+ wrote:\s*$/.test(line) &&
				(lines[i + 1] ?? "").startsWith(">")) ||
			(line.startsWith(">") &&
				lines.slice(i).every((l) => l.startsWith(">") || !l.trim())),
	);
	if (at <= 0) return { body: text, quoted: null };
	return {
		body: lines.slice(0, at).join("\n").trimEnd(),
		quoted: lines.slice(at).join("\n"),
	};
}

/**
 * The document the sandboxed frame loads: links leave in a new window and
 * images come only from the API, which proxies remote ones; anything else
 * remote stays blocked rather than reaching the sender from the reader's machine.
 */
export function emailDocument(
	html: string,
	{
		designed,
		foreground,
		link,
		imageOrigin,
	}: {
		designed: boolean;
		foreground: string;
		link: string;
		/** The API serving the email's attachments and proxied images. */
		imageOrigin: string;
	},
): string {
	const theme = designed
		? "html{background:#fff;color:#222;padding:12px}"
		: `html{background:transparent;color:${foreground}}a{color:${link}}`;
	const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${imageOrigin}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>${theme}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex}</style>`;
	return html.includes("<head>")
		? html.replace("<head>", `<head>${head}`)
		: `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

/** A draft written in HTML, made safe for the composer: its own words and formatting, without the quoted reply. */
export function draftEditorHtml(html: string): string {
	const clean = DOMPurify.sanitize(html, {
		WHOLE_DOCUMENT: true,
		FORBID_TAGS: [
			"script",
			"iframe",
			"object",
			"embed",
			"form",
			"style",
			"meta",
			"link",
			"input",
			"button",
			"textarea",
			"select",
		],
		FORBID_ATTR: ["style", "class", "srcset"],
	});
	const doc = new DOMParser().parseFromString(clean, "text/html");
	for (const quote of outermostQuotes(doc)) quote.remove();
	trimTrailingBlank(doc.body);
	return doc.body.innerHTML.trim();
}
