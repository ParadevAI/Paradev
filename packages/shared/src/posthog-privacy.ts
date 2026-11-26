export const RECORDING_UNMASK_ATTRIBUTE = "data-ph-unmask";

export const recordingUnmaskProps = {
	[RECORDING_UNMASK_ATTRIBUTE]: "",
} as const;

const MASKED_VALUE = "***";

const KEPT_VALUES = new Set(["", "true", "false"]);

const KEPT_ATTRIBUTES = new Set([
	"class",
	"style",
	"role",
	"type",
	"tabindex",
	"dir",
	"lang",
	"rel",
	"media",
	"as",
	"crossorigin",
	"charset",
	"width",
	"height",
	"cols",
	"rows",
	"colspan",
	"rowspan",
	"span",
	"hidden",
	"disabled",
	"checked",
	"selected",
	"readonly",
	"required",
	"multiple",
	"open",
	"draggable",
	"contenteditable",
	"spellcheck",
	"autocomplete",
	"autocapitalize",
	"autocorrect",
	"inputmode",
	"translate",
	"xmlns",
	"xmlns:xlink",
	"version",
	"viewBox",
	"preserveAspectRatio",
	"focusable",
	"d",
	"x",
	"y",
	"x1",
	"x2",
	"y1",
	"y2",
	"cx",
	"cy",
	"r",
	"rx",
	"ry",
	"points",
	"pathLength",
	"transform",
	"offset",
	"opacity",
	"fill",
	"fill-rule",
	"fill-opacity",
	"clip-rule",
	"stroke",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-miterlimit",
	"stroke-opacity",
	"stop-color",
	"stop-opacity",
	"vector-effect",
	"shape-rendering",
	"aria-hidden",
	"aria-expanded",
	"aria-selected",
	"aria-checked",
	"aria-disabled",
	"aria-pressed",
	"aria-current",
	"aria-orientation",
	"aria-haspopup",
	"aria-modal",
	"aria-busy",
	"aria-live",
	"aria-atomic",
	"aria-level",
	"aria-posinset",
	"aria-setsize",
	"aria-sort",
	"aria-readonly",
	"aria-required",
	"aria-invalid",
	"aria-multiline",
	"aria-multiselectable",
	"aria-autocomplete",
	"data-state",
	"data-side",
	"data-align",
	"data-orientation",
	"data-slot",
	"_cssText",
	"rr_width",
	"rr_height",
	"rr_left",
	"rr_top",
	"rr_position",
	"rr_scrollLeft",
	"rr_scrollTop",
	"rr_open",
	"rr_mediaState",
	"rr_mediaCurrentTime",
	"rr_mediaLoop",
	"rr_mediaMuted",
	"rr_mediaPlaybackRate",
	"rr_mediaVolume",
]);

const RRWEB_FULL_SNAPSHOT = 2;
const RRWEB_INCREMENTAL_SNAPSHOT = 3;
const RRWEB_PLUGIN = 6;
const RRWEB_MUTATION_SOURCE = 0;
const RRWEB_INPUT_SOURCE = 5;
const RRWEB_CONSOLE_PLUGIN = "rrweb/console@1";

function maskText(text: string): string {
	return text.replace(/\S/g, "*");
}

export function maskRecordedText(text: string, element?: HTMLElement): string {
	if (element?.closest(`[${RECORDING_UNMASK_ATTRIBUTE}]`)) return text;
	return maskText(text);
}

export function maskRecordedInput(): string {
	return MASKED_VALUE;
}

type Attributes = Record<string, unknown>;

interface SerializedNode {
	tagName?: string;
	attributes?: Attributes;
	childNodes?: SerializedNode[];
}

interface RecordingEvent {
	type?: number;
	data?: {
		source?: number;
		plugin?: string;
		text?: unknown;
		node?: SerializedNode;
		adds?: { node?: SerializedNode }[];
		attributes?: { attributes?: Attributes }[];
	};
}

function sanitizeStyleValue(value: string): string {
	return value.replace(/url\([^)]*\)/gi, "none");
}

function sanitizeStyle(style: unknown): unknown {
	if (typeof style === "string") {
		return sanitizeStyleValue(
			style.replace(/(^|;)\s*font-family\s*:[^;]*;?/gi, "$1"),
		);
	}
	if (!style || typeof style !== "object") return style;
	const diff = style as Record<string, unknown>;
	delete diff["font-family"];
	for (const [property, value] of Object.entries(diff)) {
		if (typeof value === "string") diff[property] = sanitizeStyleValue(value);
		if (Array.isArray(value) && typeof value[0] === "string") {
			diff[property] = [sanitizeStyleValue(value[0]), ...value.slice(1)];
		}
	}
	return diff;
}

function maskAttributes(
	attributes: Attributes | undefined,
	tagName: string | undefined,
): void {
	if (!attributes) return;
	for (const [name, value] of Object.entries(attributes)) {
		if (name === "style") {
			attributes[name] = sanitizeStyle(value);
			continue;
		}
		if (typeof value !== "string" || KEPT_VALUES.has(value)) continue;
		const isStylesheetHref =
			tagName === "link" && name === "href" && attributes.rel === "stylesheet";
		if (!KEPT_ATTRIBUTES.has(name) && !isStylesheetHref) {
			attributes[name] = MASKED_VALUE;
		}
	}
}

function maskNodeTree(root: SerializedNode | undefined): void {
	const stack = root ? [root] : [];
	for (let node = stack.pop(); node; node = stack.pop()) {
		maskAttributes(node.attributes, node.tagName);
		if (node.childNodes) stack.push(...node.childNodes);
	}
}

function isConsoleEvent(event: RecordingEvent): boolean {
	return (
		event.type === RRWEB_PLUGIN && event.data?.plugin === RRWEB_CONSOLE_PLUGIN
	);
}

function maskEvent(event: RecordingEvent): void {
	if (event.type === RRWEB_FULL_SNAPSHOT) {
		maskNodeTree(event.data?.node);
		return;
	}
	if (event.type !== RRWEB_INCREMENTAL_SNAPSHOT || !event.data) return;
	if (event.data.source === RRWEB_INPUT_SOURCE) {
		if (typeof event.data.text === "string") event.data.text = MASKED_VALUE;
		return;
	}
	if (event.data.source !== RRWEB_MUTATION_SOURCE) return;
	for (const add of event.data.adds ?? []) maskNodeTree(add.node);
	for (const change of event.data.attributes ?? []) {
		maskAttributes(change.attributes, undefined);
	}
}

export function maskRecordingEvents<
	T extends { event: string; properties: Record<string, unknown> } | null,
>(capture: T): T {
	if (capture?.event !== "$snapshot") return capture;
	const events = capture.properties.$snapshot_data;
	if (!Array.isArray(events)) return capture;
	const kept = (events as RecordingEvent[]).filter(
		(event) => !isConsoleEvent(event),
	);
	for (const event of kept) maskEvent(event);
	capture.properties.$snapshot_data = kept;
	return capture;
}

export function stripLinkTargets<
	T extends { event: string; properties: Record<string, unknown> } | null,
>(capture: T): T {
	if (!capture || capture.event === "$snapshot") return capture;
	delete capture.properties.$external_click_url;
	const chain = capture.properties.$elements_chain;
	if (typeof chain === "string") {
		capture.properties.$elements_chain = chain.replace(
			/(?<=^|[:"])(?:attr__)?href="(?:[^"\\]|\\.)*"/g,
			"",
		);
	}
	return capture;
}

export function dropExceptionEvents<T extends { event: string } | null>(
	capture: T,
): T | null {
	return capture?.event === "$exception" ? null : capture;
}

export const POSTHOG_PRIVACY_CONFIG = {
	mask_all_text: true,
	mask_all_element_attributes: true,
	enable_recording_console_log: false,
	session_recording: {
		maskAllInputs: true,
		maskInputFn: maskRecordedInput,
		maskTextSelector: "*",
		maskTextFn: maskRecordedText,
		blockSelector: "img",
		compress_events: false,
	},
};
