import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";

export type GitEnvironmentReason =
	| "COMMAND_LINE_TOOLS_MISSING"
	| "XCODE_LICENSE_NOT_ACCEPTED";

export interface ProjectCreateError {
	message: string;
	/** Set when git can't run on this machine; null for every other failure. */
	gitEnvironmentReason: GitEnvironmentReason | null;
}

interface ErrorData {
	code?: unknown;
	i18nKey?: unknown;
	gitEnvironment?: { kind?: unknown; reason?: unknown } | null;
}

function readData(error: unknown): ErrorData | null {
	const data = (error as { data?: unknown } | null | undefined)?.data;
	return data && typeof data === "object" ? (data as ErrorData) : null;
}

function readGitEnvironmentReason(
	data: ErrorData | null,
): GitEnvironmentReason | null {
	const reason = data?.gitEnvironment?.reason;
	return reason === "COMMAND_LINE_TOOLS_MISSING" ||
		reason === "XCODE_LICENSE_NOT_ACCEPTED"
		? reason
		: null;
}

function gitEnvironmentMessage(reason: GitEnvironmentReason | null): string {
	switch (reason) {
		case "COMMAND_LINE_TOOLS_MISSING":
			return i18n._(
				msg({
					message:
						"Git isn't installed on this Mac yet. Install Apple's Command Line Tools, then try again.",
				}),
			);
		case "XCODE_LICENSE_NOT_ACCEPTED":
			return i18n._(
				msg({
					message:
						"Git can't run until you accept the Xcode license. Run sudo xcodebuild -license in Terminal, then try again.",
				}),
			);
		case null:
			return i18n._(
				msg({
					message:
						"Git can't run in this location. Choose a different location and try again.",
				}),
			);
	}
}

/**
 * Plain-language copy for a failed project create. Messages our own code
 * wrote (non-500 errors) are shown as they are; an unexpected failure carries
 * raw command output, so it gets `fallback` instead.
 */
export function toProjectCreateError(
	error: unknown,
	fallback: string,
): ProjectCreateError {
	const data = readData(error);
	if (data?.gitEnvironment) {
		const reason = readGitEnvironmentReason(data);
		return {
			message: gitEnvironmentMessage(reason),
			gitEnvironmentReason: reason,
		};
	}
	const isOwnMessage =
		typeof data?.i18nKey === "string" ||
		(typeof data?.code === "string" && data.code !== "INTERNAL_SERVER_ERROR");
	if (!isOwnMessage) {
		console.error("[project create] failed", rawErrorMessage(error), error);
	}
	return {
		message: isOwnMessage ? errorMessage(error, fallback) : fallback,
		gitEnvironmentReason: null,
	};
}
