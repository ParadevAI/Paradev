import { CLOUD_AGENT_IDS } from "@superset/shared/cloud-agent-launch";
import type { HostDb } from "../../../../db";
import { ensurePresetRow } from "../../../../trpc/router/settings/agent-configs";
import { pdevAgentDir, trustPdevWorkspace } from "../trustPdevWorkspace";

export function seedSandboxAgents(
	db: HostDb,
	workspaceRoot: string,
	agentDir: string = pdevAgentDir(),
): void {
	for (const agent of CLOUD_AGENT_IDS) ensurePresetRow(db, agent);
	try {
		trustPdevWorkspace(workspaceRoot, agentDir);
	} catch (error) {
		console.warn("[sandbox] could not prepare pdev folder trust", error);
	}
}
