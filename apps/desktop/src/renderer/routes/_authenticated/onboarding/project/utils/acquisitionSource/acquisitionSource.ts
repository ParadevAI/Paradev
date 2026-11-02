export const AI_ACQUISITION_SOURCES = [
	"chatgpt",
	"claude",
	"perplexity",
	"gemini",
	"other_ai_assistant",
] as const;

export const OTHER_ACQUISITION_SOURCES = [
	"search_engine",
	"friend_or_colleague",
	"x_twitter",
	"reddit",
	"youtube",
	"product_hunt",
	"hacker_news",
	"github",
	"newsletter_or_blog",
	"other",
] as const;

export const ACQUISITION_SOURCES = [
	...AI_ACQUISITION_SOURCES,
	...OTHER_ACQUISITION_SOURCES,
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export interface AcquisitionSourceAnswer {
	source: AcquisitionSource | null;
	otherText: string;
}

export const EMPTY_ACQUISITION_SOURCE_ANSWER: AcquisitionSourceAnswer = {
	source: null,
	otherText: "",
};

export const ACQUISITION_SOURCE_OTHER_MAX_LENGTH = 100;

export const ACQUISITION_SOURCE_EVENT = "acquisition_source_answered";

export function isAcquisitionSource(value: string): value is AcquisitionSource {
	return (ACQUISITION_SOURCES as readonly string[]).includes(value);
}

export function buildAcquisitionSourceProperties({
	source,
	otherText,
}: AcquisitionSourceAnswer): Record<string, unknown> | null {
	if (!source) return null;
	const isAiAssistant = (AI_ACQUISITION_SOURCES as readonly string[]).includes(
		source,
	);
	const text =
		source === "other"
			? otherText.trim().slice(0, ACQUISITION_SOURCE_OTHER_MAX_LENGTH)
			: "";
	if (!text) {
		return {
			source,
			is_ai_assistant: isAiAssistant,
			$set: { acquisition_source: source },
			$unset: ["acquisition_source_other"],
		};
	}
	return {
		source,
		is_ai_assistant: isAiAssistant,
		other_text: text,
		$set: { acquisition_source: source, acquisition_source_other: text },
	};
}
