import type { Message, SpokenWord } from "../model/model.ts";
import { plainText } from "../plain-text/plain-text.ts";

/** Bars in a voice note's waveform, as recorded and as drawn: about one per 3 px of a bubble's 150 px. */
export const VOICE_WAVEFORM_BARS = 48;

/** The longest voice note: a message, not a dictation. */
export const MAX_VOICE_NOTE_MS = 5 * 60_000;

/** The shortest that's sent; less is a slip of the key or the button. */
export const MIN_VOICE_NOTE_MS = 600;

/** "0:06", "1:42": a voice note's length as its bubble and notification say it. */
export function voiceDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Levels sampled while recording (any count, any scale ≥ 0) as `bars` bars from 0 to 1: the loudest of each stretch,
 * scaled to the loudest bar, so a quiet voice still draws a shape. Rounded to two places, which is all a bar shows.
 */
export function waveformBars(
	levels: readonly number[],
	bars = VOICE_WAVEFORM_BARS,
): number[] {
	if (levels.length === 0) return Array.from({ length: bars }, () => 0);
	const out: number[] = [];
	for (let i = 0; i < bars; i++) {
		const from = Math.floor((i * levels.length) / bars);
		const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
		let peak = 0;
		for (let j = from; j < to && j < levels.length; j++)
			peak = Math.max(peak, levels[j]! > 0 ? levels[j]! : 0);
		out.push(peak);
	}
	const top = Math.max(...out);
	return out.map((v) => (top > 0 ? Math.round((v / top) * 100) / 100 : 0));
}

/**
 * A meter's dBFS reading (AVAudioRecorder's -160…0, the Web Audio analyser's) as a level from 0 to 1: below -50 dB is
 * silence, and the rest is spread so speech fills the bar.
 */
export function levelFromDecibels(db: number): number {
	if (!Number.isFinite(db) || db <= -50) return 0;
	return Math.min(1, ((db + 50) / 50) ** 1.6);
}

/** The longest reply that's spoken: past about 45 seconds of speech, people want to read it. */
export const MAX_SPOKEN_CHARS = 700;

/**
 * What a reply sounds like read aloud, or null when it shouldn't be spoken: code, a table or a long answer reads better
 * than it sounds. Markdown goes, links keep their label, and bare addresses are left out.
 */
export function speakableText(markdown: string): string | null {
	if (/```|^\s*\|.*\|\s*$/m.test(markdown)) return null;
	const text = plainText(markdown)
		.replace(/https?:\/\/\S+/g, "")
		.replace(/\s+([,.!?;:])/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
	if (!text || text.length > MAX_SPOKEN_CHARS) return null;
	return text;
}

/** What's said in place of what a call can't read: code, a table, the part past the length. */
const REST_IN_CHAT = "The rest is in the chat.";

/**
 * What a reply sounds like on a call, where silence is worse than a long line: code and tables go (they're in the
 * chat, and said to be), and a long answer is read to the last sentence that fits, then "The rest is in the chat."
 * Null only with nothing to say at all.
 */
export function callSpeechText(markdown: string): string | null {
	const prose = markdown
		.replace(/```[^\n]*\n?[\s\S]*?```/g, " ")
		.replace(/^\s*\|.*\|\s*$/gm, " ");
	let cut = prose !== markdown;
	let text = plainText(prose)
		.replace(/https?:\/\/\S+/g, "")
		.replace(/\s+([,.!?;:])/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
	if (text.length > MAX_SPOKEN_CHARS) {
		const head = text.slice(0, MAX_SPOKEN_CHARS);
		const sentence = Math.max(
			head.lastIndexOf(". "),
			head.lastIndexOf("! "),
			head.lastIndexOf("? "),
		);
		const end =
			sentence > MAX_SPOKEN_CHARS / 3 ? sentence + 1 : head.lastIndexOf(" ");
		text = head.slice(0, end > 0 ? end : MAX_SPOKEN_CHARS).trim();
		cut = true;
	}
	if (!text) return cut ? "It's in the chat." : null;
	return cut ? `${text} ${REST_IN_CHAT}` : text;
}

/**
 * Whether a voice note's words show under it from the start. A Dev's spoken reply is for listening: its words stay
 * folded until someone asks for them ("Show transcript"); a person's note shows what they said.
 */
export function transcriptShown(
	message: Pick<Message, "authorDevId">,
): boolean {
	return !message.authorDevId;
}

/**
 * Character timings (ElevenLabs' alignment: each character with its start and end, in seconds) as words: runs of
 * characters between spaces, each from its first character's start to its last one's end.
 */
export function wordsFromAlignment(alignment: {
	characters: string[];
	character_start_times_seconds: number[];
	character_end_times_seconds: number[];
}): SpokenWord[] {
	const words: SpokenWord[] = [];
	let text = "";
	let start = 0;
	let end = 0;
	const flush = () => {
		if (text)
			words.push({
				text,
				startMs: Math.round(start * 1000),
				endMs: Math.round(end * 1000),
			});
		text = "";
	};
	alignment.characters.forEach((ch, i) => {
		if (/\s/.test(ch)) {
			flush();
			return;
		}
		if (!text) start = alignment.character_start_times_seconds[i] ?? end;
		text += ch;
		end = alignment.character_end_times_seconds[i] ?? start;
	});
	flush();
	return words;
}

/** The word being said at `ms` into the reply: the last one started by then, or -1 before the first. */
export function spokenWordAt(words: readonly SpokenWord[], ms: number): number {
	let at = -1;
	for (let i = 0; i < words.length && words[i]!.startMs <= ms; i++) at = i;
	return at;
}

/** 16-bit mono PCM as a WAV file: the 44-byte RIFF header, then the samples. */
export function wavFromPcm(pcm: Uint8Array, rate: number): Uint8Array {
	const length = pcm.byteLength - (pcm.byteLength % 2);
	const out = new Uint8Array(44 + length);
	const view = new DataView(out.buffer);
	const text = (at: number, s: string) => {
		[...s].forEach((ch, i) => {
			view.setUint8(at + i, ch.charCodeAt(0));
		});
	};
	text(0, "RIFF");
	view.setUint32(4, 36 + length, true);
	text(8, "WAVE");
	text(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, length, true);
	out.set(pcm.subarray(0, length), 44);
	return out;
}
