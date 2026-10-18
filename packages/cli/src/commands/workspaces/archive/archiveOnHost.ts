import { CLIError } from "@superset/cli-framework";
import { rawErrorMessage } from "@superset/i18n/errors";
import { TRPCClientError } from "@trpc/client";
import type { HostServiceClient } from "../../../lib/host-target";

export type HostArchiveOutcome =
	| { id: string; status: "deleted"; warnings: string[] }
	| { id: string; status: "not_found" }
	| { id: string; status: "failed"; reason: string };

export type DeleteReport = {
	deleted: string[];
	notFound: string[];
	failed: { id: string; reason: string }[];
	warnings: string[];
};

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
	const deleted: HostArchiveOutcome = {
		id,
		status: "deleted",
		warnings: result.warnings ?? [],
	};
	if ("found" in result && typeof result.found === "boolean") {
		return result.found ? deleted : { id, status: "not_found" };
	}
	// Hosts before `found` answer success for any id. A delete only archives
	// the row, so a row that is still missing afterwards never existed.
	try {
		await client.workspace.get.query({ id });
		return deleted;
	} catch (error) {
		if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
			return { id, status: "not_found" };
		}
		return { id, status: "failed", reason: rawErrorMessage(error) };
	}
}

export function reportHostOutcomes(
	outcomes: HostArchiveOutcome[],
	hostId: string,
): { data: DeleteReport; message: string } {
	const data: DeleteReport = {
		deleted: [],
		notFound: [],
		failed: [],
		warnings: [],
	};
	for (const outcome of outcomes) {
		if (outcome.status === "deleted") {
			data.deleted.push(outcome.id);
			for (const warning of outcome.warnings) {
				data.warnings.push(`${outcome.id}: ${warning}`);
			}
		} else if (outcome.status === "not_found") {
			data.notFound.push(outcome.id);
		} else {
			data.failed.push({ id: outcome.id, reason: outcome.reason });
		}
	}

	const lines = [
		...data.deleted.map((id) => `Archived workspace ${id}`),
		...data.warnings.map((warning) => `Warning: ${warning}`),
		...data.notFound.map(
			(id) => `Not found: no workspace ${id} on host ${hostId}`,
		),
		...data.failed.map(({ id, reason }) => `Failed: ${id}: ${reason}`),
	];
	if (data.notFound.length > 0 || data.failed.length > 0) {
		throw new CLIError(
			lines.join("\n"),
			data.notFound.length > 0
				? "Pass full workspace IDs (superset workspaces list), and --host <id> for a workspace on another machine"
				: undefined,
			data,
		);
	}
	return {
		data,
		message:
			data.deleted.length === 1 && data.warnings.length === 0
				? `Archived workspace ${data.deleted[0]}`
				: lines.join("\n"),
	};
}
