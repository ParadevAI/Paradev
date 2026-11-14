import { MAX_ATTACHMENTS } from "@superset/shared/attachment-limits";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { releaseSourceTerminals } from "../releaseSourceTerminals";

/** A terminal agent `teleport.prepareWorkspace` stopped and uploaded. */
export type MovingTerminal = {
	terminalId: string;
	agent: string;
	agentId: string;
	harnessSessionId: string;
	title: string;
	bundle: { fileId: string; sha256: string; byteLength: number };
};

/** Titles of the terminals that did not move: started again at the source, or not. */
export type TerminalHandoff = { stayed: string[]; notRestarted: string[] };

type Host = Pick<HostServiceClient, "teleport">;

const RETRYABLE_CODES = new Set([
	"BAD_GATEWAY",
	"SERVICE_UNAVAILABLE",
	"GATEWAY_TIMEOUT",
	"TIMEOUT",
]);

function errorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "data" in error
		? (error as { data?: { code?: string } }).data?.code
		: undefined;
}

/** A host that answered with a refusal will answer the same again; one that did not answer, or was not up, may not. */
function isRetryable(error: unknown): boolean {
	const code = errorCode(error);
	return code === undefined || RETRYABLE_CODES.has(code);
}

/**
 * Tells the source a terminal is going to the destination, so it never
 * starts it again by itself. False when the source could not record it; a
 * source too old to know the call keeps no such record, so it is true.
 */
async function markHandingOff(
	source: Host,
	workspaceMoveId: string | undefined,
	terminalId: string,
): Promise<boolean> {
	if (!workspaceMoveId) return true;
	return source.teleport.markHandingOff
		.mutate({ workspaceMoveId, terminalId })
		.then(
			() => true,
			(error: unknown) => errorCode(error) === "NOT_FOUND",
		);
}

/**
 * Starts each moved terminal's agent in the workspace it moved to. `connect`
 * is tried up to `attempts` times for a destination that is still starting;
 * an answer that retrying will not change ends the wait at once. A terminal
 * that does not arrive starts again where it was.
 */
export async function handOffTerminals({
	terminals,
	source,
	sourceWorkspaceId,
	workspaceMoveId,
	toWorkspaceId,
	connect,
	resolveUrls,
	attempts = 1,
	retryDelayMs = 0,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
	terminals: readonly MovingTerminal[];
	source: Host;
	sourceWorkspaceId: string;
	/** The move these terminals belong to, which the source keeps to undo it without this window. */
	workspaceMoveId?: string;
	toWorkspaceId: string;
	connect: () => Promise<Host>;
	resolveUrls: (
		fileIds: string[],
	) => Promise<readonly { fileId: string; url: string }[]>;
	attempts?: number;
	retryDelayMs?: number;
	sleep?: (ms: number) => Promise<void>;
}): Promise<TerminalHandoff> {
	if (terminals.length === 0) return { stayed: [], notRestarted: [] };
	let remaining = [...terminals];
	const refused: MovingTerminal[] = [];
	try {
		const urls = new Map<string, string>();
		for (let index = 0; index < terminals.length; index += MAX_ATTACHMENTS) {
			const fileIds = terminals
				.slice(index, index + MAX_ATTACHMENTS)
				.map((terminal) => terminal.bundle.fileId);
			for (const { fileId, url } of await resolveUrls(fileIds)) {
				urls.set(fileId, url);
			}
		}
		for (let attempt = 1; attempt <= attempts; attempt++) {
			const settled = new Set<MovingTerminal>();
			let lastError: unknown = null;
			try {
				const host = await connect();
				for (const terminal of remaining) {
					const url = urls.get(terminal.bundle.fileId);
					if (!url) {
						refused.push(terminal);
						settled.add(terminal);
						continue;
					}
					if (
						!(await markHandingOff(
							source,
							workspaceMoveId,
							terminal.terminalId,
						))
					) {
						lastError = new Error("The source did not record the handoff");
						continue;
					}
					await host.teleport.importTerminalSession
						.mutate({
							workspaceId: toWorkspaceId,
							agent: terminal.agent,
							agentId: terminal.agentId,
							harnessSessionId: terminal.harnessSessionId,
							bundle: { ...terminal.bundle, url },
						})
						.then(
							() => settled.add(terminal),
							(error: unknown) => {
								lastError = error;
								if (isRetryable(error)) return;
								refused.push(terminal);
								settled.add(terminal);
							},
						);
				}
			} catch (error) {
				lastError = error;
				if (!isRetryable(error)) {
					refused.push(...remaining);
					remaining = [];
					break;
				}
			}
			remaining = remaining.filter((terminal) => !settled.has(terminal));
			if (remaining.length === 0) break;
			if (attempt === attempts) {
				console.warn(
					"[workspace-move] terminals did not reach the destination",
					lastError,
				);
				break;
			}
			await sleep(retryDelayMs);
		}
	} catch (error) {
		console.warn("[workspace-move] could not hand off the terminals", error);
		refused.push(...remaining);
		remaining = [];
	}
	const stayed = [...refused, ...remaining];
	const failedIds = new Set(
		await releaseSourceTerminals(
			source,
			sourceWorkspaceId,
			stayed.map((terminal) => terminal.terminalId),
		),
	);
	return {
		stayed: stayed
			.filter((terminal) => !failedIds.has(terminal.terminalId))
			.map((terminal) => terminal.title),
		notRestarted: stayed
			.filter((terminal) => failedIds.has(terminal.terminalId))
			.map((terminal) => terminal.title),
	};
}

/** The terminals the source host left running, or could not start again, when it prepared the move. */
export function skippedTerminalNames(
	skipped: readonly { title: string; reason: string; stopped?: boolean }[] = [],
): TerminalHandoff {
	const named = skipped.filter((terminal) => terminal.reason !== "not_started");
	return {
		stayed: named
			.filter((terminal) => !terminal.stopped)
			.map((terminal) => terminal.title),
		notRestarted: named
			.filter((terminal) => terminal.stopped)
			.map((terminal) => terminal.title),
	};
}

export function mergeHandoffs(
	first: TerminalHandoff,
	second: TerminalHandoff,
): TerminalHandoff {
	return {
		stayed: [...first.stayed, ...second.stayed],
		notRestarted: [...first.notRestarted, ...second.notRestarted],
	};
}
