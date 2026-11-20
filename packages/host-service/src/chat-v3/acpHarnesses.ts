import type { HarnessFactory, ResolveAttachment } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { captureSessionAccount } from "../trpc/router/usage/session-account/session-account";
import { ACP_HARNESSES } from "./acpCatalogue";
import { type AcpLaunch, resolveAcpLaunch } from "./acpLaunch";
import { storeAgentImage } from "./agentImages";
import type { ChatAgentBridge } from "./chatAgentBridge";

export function acpHarnessFactory(
	harness: string,
	db: HostDb,
	resolveAttachment: ResolveAttachment,
	agents?: ChatAgentBridge,
	discovery?: { launch: AcpLaunch },
): HarnessFactory | null {
	const entry = ACP_HARNESSES[harness];
	if (!entry) return null;

	return (options) =>
		createAcpAdapter({
			command: entry.binary,
			...(discovery ? { startupTimeoutMs: 10_000 } : {}),
			cwd: options.cwd,
			resolveAttachment,
			storeImage: storeAgentImage,
			...(entry.fullAccessModeId
				? { defaultModeId: entry.fullAccessModeId }
				: {}),
			...(entry.clientApprovalModes ? { clientApprovalModes: true } : {}),
			...(entry.forkAtMessage ? { forkAtMessage: true } : {}),
			...(entry.protocolVersion
				? { protocolVersion: entry.protocolVersion }
				: {}),
			onSpawn: (pid) => agents?.spawned(options.sessionId, pid),
			launch: async () => {
				const launch =
					discovery?.launch ?? (await resolveAcpLaunch(db, options));
				const env = launch.env;
				if (!discovery)
					void captureSessionAccount(
						entry.binary,
						(entry.binary === "codex"
							? env.CODEX_HOME
							: env.CLAUDE_CONFIG_DIR) ?? "",
						Boolean(
							entry.binary === "codex"
								? env.OPENAI_API_KEY
								: env.ANTHROPIC_API_KEY,
						),
					)
						.then((account) => {
							if (account) agents?.accountCaptured(options.sessionId, account);
						})
						.catch(() => undefined);
				return launch;
			},
		});
}

export function acpHarnessEntries(
	db: HostDb,
	resolveAttachment: ResolveAttachment,
	agents?: ChatAgentBridge,
): [string, HarnessFactory][] {
	const entries: [string, HarnessFactory][] = [];
	for (const harness of Object.keys(ACP_HARNESSES)) {
		const factory = acpHarnessFactory(harness, db, resolveAttachment, agents);
		if (factory) entries.push([harness, factory]);
	}
	return entries;
}
