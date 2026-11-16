/** A voice a Dev may speak in: one of ElevenLabs' premade voices, by its public id. */
export interface DevVoice {
	id: string;
	name: string;
	/** How it sounds, then its accent: "Warm, velvety · British". */
	description: string;
}

/**
 * The voices people pick from, in the order shown. Premade ones, so every ElevenLabs account has them; a Dev with
 * none chosen (null) speaks in the server's default (`ELEVENLABS_VOICE_ID`). Ids are stored, so never change one.
 */
export const DEV_VOICES: readonly DevVoice[] = [
	{
		id: "EXAVITQu4vr4xnSDxMaL",
		name: "Sarah",
		description: "Soft, reassuring · American",
	},
	{
		id: "Xb7hH8MSUJpSbSDYk0k2",
		name: "Alice",
		description: "Clear, confident · British",
	},
	{
		id: "pFZP5JQG7iQjIQuC4Bku",
		name: "Lily",
		description: "Warm, velvety · British",
	},
	{
		id: "XrExE9yKIg1WjnnlVkGX",
		name: "Matilda",
		description: "Friendly, knowledgeable · American",
	},
	{
		id: "FGY2WhTYpPnrIDTdsKH5",
		name: "Laura",
		description: "Sunny, quirky · American",
	},
	{
		id: "SAz9YHcvj6GT2YYXdXww",
		name: "River",
		description: "Relaxed, neutral · American",
	},
	{
		id: "onwK4e9ZLuTAKqWW03F9",
		name: "Daniel",
		description: "Steady, broadcaster · British",
	},
	{
		id: "nPczCjzI2devNBz1zQrb",
		name: "Brian",
		description: "Deep, resonant · American",
	},
	{
		id: "IKne3meq5aSn9XLyUdCD",
		name: "Charlie",
		description: "Natural, upbeat · Australian",
	},
	{
		id: "bIHbv24MWmeRgasZH58o",
		name: "Will",
		description: "Laid-back, friendly · American",
	},
];

export function isDevVoiceId(value: unknown): value is string {
	return typeof value === "string" && DEV_VOICES.some((v) => v.id === value);
}

/** A Dev's chosen voice; undefined for the default (null) or one no longer offered. */
export const devVoice = (id: string | null | undefined): DevVoice | undefined =>
	DEV_VOICES.find((v) => v.id === id);

/** What a voice's preview says, in the Dev's name. */
export const voicePreviewText = (devName: string) =>
	`Hi, I'm ${devName.trim() || "Dev"}. This is how I sound.`;
