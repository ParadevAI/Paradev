import { MAX_ATTACHMENTS } from "@superset/shared/attachment-limits";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
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

type Host = Pick<HostServiceClient, "teleport">;

/**
 * Starts each moved terminal's agent in the workspace it moved to. `connect`
 * is tried up to `attempts` times, for a cloud box that is still starting.
 * A terminal that does not arrive starts again where it was. Returns the
 * titles of those.
 */
export async function handOffTerminals({
	terminals,
	source,
	sourceWorkspaceId,
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
	toWorkspaceId: string;
	connect: () => Promise<Host>;
	resolveUrls: (
		fileIds: string[],
	) => Promise<readonly { fileId: string; url: string }[]>;
	attempts?: number;
	retryDelayMs?: number;
	sleep?: (ms: number) => Promise<void>;
}): Promise<string[]> {
	if (terminals.length === 0) return [];
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
								if (!isRefusal(error)) return;
								refused.push(terminal);
								settled.add(terminal);
							},
						);
				}
			} catch (error) {
				lastError = error;
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
	}
	const stayed = [...refused, ...remaining];
	await releaseSourceTerminals(
		source,
		sourceWorkspaceId,
		stayed.map((terminal) => terminal.terminalId),
	);
	return stayed.map((terminal) => terminal.title);
}

/** An answer that retrying will not change, unlike a box still starting. */
function isRefusal(error: unknown): boolean {
	if (isMissingProcedureError(error)) return true;
	const code =
		typeof error === "object" && error !== null && "data" in error
			? (error as { data?: { code?: string } }).data?.code
			: undefined;
	return code === "PRECONDITION_FAILED" || code === "BAD_REQUEST";
}
