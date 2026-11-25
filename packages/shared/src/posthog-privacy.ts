export const RECORDING_UNMASK_ATTRIBUTE = "data-ph-unmask";

export const recordingUnmaskProps = {
	[RECORDING_UNMASK_ATTRIBUTE]: "",
} as const;

const MASKED_ATTRIBUTES = ["title", "aria-label", "alt", "placeholder"];

const RRWEB_FULL_SNAPSHOT = 2;
const RRWEB_INCREMENTAL_SNAPSHOT = 3;
const RRWEB_MUTATION_SOURCE = 0;

function maskText(text: string): string {
	return text.replace(/\S/g, "*");
}

export function maskRecordedText(text: string, element?: HTMLElement): string {
	if (element?.closest(`[${RECORDING_UNMASK_ATTRIBUTE}]`)) return text;
	return maskText(text);
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
		node?: SerializedNode;
		adds?: { node?: SerializedNode }[];
		attributes?: { attributes?: Attributes }[];
	};
}

function maskAttribute(attributes: Attributes, name: string): void {
	const value = attributes[name];
	if (typeof value === "string") attributes[name] = maskText(value);
}

function maskAttributes(attributes: Attributes | undefined): void {
	if (!attributes) return;
	for (const name of MASKED_ATTRIBUTES) maskAttribute(attributes, name);
}

function maskNodeTree(root: SerializedNode | undefined): void {
	const stack = root ? [root] : [];
	for (let node = stack.pop(); node; node = stack.pop()) {
		if (node.attributes && RECORDING_UNMASK_ATTRIBUTE in node.attributes) {
			continue;
		}
		maskAttributes(node.attributes);
		if (node.tagName === "a" && node.attributes) {
			maskAttribute(node.attributes, "href");
		}
		if (node.childNodes) stack.push(...node.childNodes);
	}
}

function maskEventAttributes(event: RecordingEvent): void {
	if (event.type === RRWEB_FULL_SNAPSHOT) {
		maskNodeTree(event.data?.node);
		return;
	}
	if (
		event.type !== RRWEB_INCREMENTAL_SNAPSHOT ||
		event.data?.source !== RRWEB_MUTATION_SOURCE
	) {
		return;
	}
	for (const add of event.data.adds ?? []) maskNodeTree(add.node);
	for (const { attributes } of event.data.attributes ?? []) {
		if (!attributes) continue;
		maskAttributes(attributes);
		const href = attributes.href;
		if (typeof href === "string" && !href.startsWith("#")) {
			maskAttribute(attributes, "href");
		}
	}
}

export function maskRecordingAttributes<
	T extends { event: string; properties: Record<string, unknown> } | null,
>(capture: T): T {
	if (capture?.event !== "$snapshot") return capture;
	const events = capture.properties.$snapshot_data;
	if (Array.isArray(events)) {
		for (const event of events) maskEventAttributes(event as RecordingEvent);
	}
	return capture;
}

export const POSTHOG_PRIVACY_CONFIG = {
	mask_all_text: true,
	mask_all_element_attributes: true,
	session_recording: {
		maskAllInputs: true,
		maskTextSelector: "*",
		maskTextFn: maskRecordedText,
		compress_events: false,
	},
};
