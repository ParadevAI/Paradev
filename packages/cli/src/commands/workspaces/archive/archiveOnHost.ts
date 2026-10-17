import { rawErrorMessage } from "@superset/i18n/errors";
import { TRPCClientError } from "@trpc/client";
import type { HostServiceClient } from "../../../lib/host-target";

export type HostArchiveOutcome =
	| { id: string; status: "deleted"; warnings: string[] }
	| { id: string; status: "not_found" }
	| { id: string; status: "failed"; reason: string };

type WorkspaceClient = {
	workspace: {
		delete: Pick<HostServiceClient["workspace"]["delete"], "mutate">;
		get: Pick<HostServiceClient["workspace"]["get"], "query">;
	};
};

export async function archiveOnHost(
	client: WorkspaceClient,
	ids: string[],
): Promise<HostArchiveOutcome[]> {
	const outcomes: HostArchiveOutcome[] = [];
	for (const id of ids) {
		outcomes.push(await archiveOne(client, id));
	}
	return outcomes;
}

async function archiveOne(
	client: WorkspaceClient,
	id: string,
): Promise<HostArchiveOutcome> {
	let result: Awaited<ReturnType<typeof client.workspace.delete.mutate>>;
	try {
		result = await client.workspace.delete.mutate({ id });
	} catch (error) {
		return { id, status: "failed", reason: rawErrorMessage(error) };
	}
	const found =
		"found" in result && typeof result.found === "boolean"
			? result.found
			: await existsOnOlderHost(client, id);
	if (!found) return { id, status: "not_found" };
	return { id, status: "deleted", warnings: result.warnings ?? [] };
}

// Hosts before `found` answer success for any id. A delete only archives
// the row, so a row that is still missing afterwards never existed.
async function existsOnOlderHost(
	client: WorkspaceClient,
	id: string,
): Promise<boolean> {
	try {
		await client.workspace.get.query({ id });
		return true;
	} catch (error) {
		return !(
			error instanceof TRPCClientError && error.data?.code === "NOT_FOUND"
		);
	}
}
