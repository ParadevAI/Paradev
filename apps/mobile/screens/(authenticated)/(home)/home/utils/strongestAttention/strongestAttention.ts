import {
	ATTENTION_PRIORITY,
	type TerminalAttention,
} from "../../hooks/useHostTerminals/attention";

/** The most urgent state among rows a collapsed header hides. */
export function strongestAttention(
	attentions: Iterable<TerminalAttention | null | undefined>,
): TerminalAttention | null {
	let strongest: TerminalAttention | null = null;
	for (const attention of attentions) {
		if (!attention) continue;
		if (
			!strongest ||
			ATTENTION_PRIORITY[attention] > ATTENTION_PRIORITY[strongest]
		) {
			strongest = attention;
		}
	}
	return strongest;
}
