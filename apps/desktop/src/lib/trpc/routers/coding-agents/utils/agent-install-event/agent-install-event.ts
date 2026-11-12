import {
	type InstallFailure,
	installFailureOf,
} from "../../../utils/download-verified";

export type AgentInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	| { stage: "installing" }
	| { stage: "done"; version: string; path: string }
	| { stage: "failed"; reason: InstallFailure };

export function toFailedEvent(error: unknown): AgentInstallEvent {
	return { stage: "failed", reason: installFailureOf(error) };
}
