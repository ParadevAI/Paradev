import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { MOVE_STOPPED_ANSWERING } from "@superset/shared/move-book";

export interface MoveErrorDescription {
	reason: string;
	/** The original text, kept for a details view when `reason` replaced it. */
	details: string | null;
}

/** Stored as a cancelled move's error, so every view can say it was cancelled. */
export const MOVE_CANCELLED = "Cancelled by the person moving it";

const UNREACHABLE =
	/failed to fetch|fetch failed|network ?error|load failed|econnrefused|etimedout|enotfound/i;

/** A move's stored or thrown error, in words a person can act on. */
export function describeMoveError(raw: string | null): MoveErrorDescription {
	const text = raw?.trim() ?? "";
	if (!text) {
		return {
			reason: i18n._(msg({ message: "Something went wrong during the move." })),
			details: null,
		};
	}
	if (text === MOVE_CANCELLED || /\baborted\b/i.test(text)) {
		return {
			reason: i18n._(msg({ message: "The move was cancelled." })),
			details: null,
		};
	}
	if (text === MOVE_STOPPED_ANSWERING) {
		return {
			reason: i18n._(
				msg({ message: "The move stopped responding, so it was ended." }),
			),
			details: text,
		};
	}
	if (
		text.startsWith("Moves are unreachable") ||
		text.startsWith("Moves refused the call")
	) {
		return {
			reason: i18n._(msg({ message: "The move service couldn't be reached." })),
			details: text,
		};
	}
	if (UNREACHABLE.test(text)) {
		return {
			reason: i18n._(msg({ message: "The connection was lost." })),
			details: text,
		};
	}
	return { reason: text, details: null };
}
