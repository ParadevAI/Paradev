import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../api-client";

export interface ForwardRow {
	port: number;
	localUrl: string;
	user: string;
	userId: string;
	since: string;
}

export function forwardsWorkspaceId(option: string | null | undefined): string {
	const id = option ?? process.env.SUPERSET_WORKSPACE_ID;
	if (!id) {
		throw new CLIError(
			"No workspace",
			"Pass --workspace <id>, or run this inside a cloud workspace",
		);
	}
	return id;
}

export async function listForwards(
	api: ApiClient,
	workspaceId: string,
): Promise<ForwardRow[]> {
	let forwards: Awaited<
		ReturnType<ApiClient["cloudWorkspace"]["forwards"]["query"]>
	>["forwards"];
	try {
		({ forwards } = await api.cloudWorkspace.forwards.query({
			id: workspaceId,
		}));
	} catch (error) {
		const code = (error as { data?: { code?: string } }).data?.code;
		if (code === "NOT_FOUND" || code === "BAD_REQUEST") {
			throw new CLIError(
				`No cloud workspace ${workspaceId} that you can open`,
				"Forwarded ports exist for cloud workspaces only; pass --workspace <cloud workspace id>",
			);
		}
		throw error;
	}
	return forwards.map((forward) => ({
		port: forward.port,
		localUrl: `http://localhost:${forward.localPort}`,
		user: forward.user.name,
		userId: forward.user.id,
		since: new Date(forward.since).toISOString(),
	}));
}
