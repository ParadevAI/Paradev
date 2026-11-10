import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { MOVE_STOPPED_ANSWERING } from "@superset/shared/move-book";

export interface MoveErrorDescription {
	reason: string;
	/** The original text, kept for a details view when `reason` replaced it. */
	details: string | null;
}

/** Stored as a cancelled move's error, so every view can say it was cancelled. */
export const MOVE_CANCELLED = "Cancelled by the person moving it";

const UNREACHABLE =
	/failed to fetch|fetch failed|network ?error|load failed|econnrefused|enotfound/i;
const TIMED_OUT = /\baborted\b|timed? ?out|timeout|etimedout/i;
/** The relay's answer when the host it should forward to has no tunnel. */
const HOST_OFFLINE = "Host is not online";
const CLOUD_NOT_RUNNING = /^The cloud workspace (is \w+|was deleted)$/;
/** tRPC prefixes a host error with the procedure path, as in `teleport.importChat: …`. */
const PROCEDURE_PREFIX = /^[a-z][\w-]*(\.[a-z][\w-]*)+: /i;

/** A move's stored or thrown error, in words a person can act on. */
export function describeMoveError(raw: string | null): MoveErrorDescription {
	const text = raw?.trim() ?? "";
	if (!text) {
		return {
			reason: i18n._(msg({ message: "Something went wrong during the move." })),
			details: null,
		};
	}
	if (text === MOVE_CANCELLED) {
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
	if (isMissingProcedureError({ message: text })) {
		return {
			reason: i18n._(
				msg({
					message:
						"The other side of the move runs an older version. Restart a cloud workspace or update the computer's host, then try again.",
				}),
			),
			details: text,
		};
	}
	const unprefixed = text.replace(PROCEDURE_PREFIX, "");
	if (unprefixed === HOST_OFFLINE) {
		return {
			reason: i18n._(
				msg({
					message:
						"The workspace couldn't be reached. Check that it is running, then try again.",
				}),
			),
			details: text,
		};
	}
	if (CLOUD_NOT_RUNNING.test(unprefixed)) {
		return {
			reason: i18n._(
				msg({
					message:
						"The cloud workspace is not running. Start it, then try again.",
				}),
			),
			details: text,
		};
	}
	if (UNREACHABLE.test(text)) {
		return {
			reason: i18n._(msg({ message: "The connection was lost." })),
			details: text,
		};
	}
	if (TIMED_OUT.test(text)) {
		return {
			reason: i18n._(msg({ message: "The move timed out." })),
			details: text,
		};
	}
	return {
		reason: unprefixed,
		details: unprefixed === text ? null : text,
	};
}
