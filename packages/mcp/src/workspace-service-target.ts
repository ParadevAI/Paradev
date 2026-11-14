import { createSandboxAccess } from "@superset/shared/sandbox/access";
import { callWithWake } from "@superset/shared/sandbox/reach";
import { z } from "zod";
import type { McpContext } from "./auth";
import { createMcpCaller } from "./caller";
import { canWakeAndRetry, hostServiceCall } from "./host-service-client";

/** Where a workspace-scoped tool reaches: a host by id, or a cloud workspace. */
export const workspaceLocationInput = {
	hostId: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Host machineId the workspace lives on. Omit for a cloud workspace (accounts with cloud workspaces only).",
		),
};

/**
 * Omitting hostId means a cloud workspace only for an account that can use
 * them; for everyone else hostId stays required, as it was before cloud
 * workspaces, so no existing client's calls change.
 */
export async function requireCloudUnlessHost(
	input: { hostId?: string },
	ctx: McpContext,
): Promise<void> {
	if (input.hostId) return;
	const { available } = await createMcpCaller(ctx).cloudWorkspace.available();
	if (!available) {
		throw new Error(
			"hostId is required. Find it with hosts_list, and the workspace with workspaces_list",
		);
	}
}

/**
 * Calls host-service for a workspace. A host workspace goes through the
 * relay. A cloud workspace goes through its sandbox gate with a ticket for the
 * sandbox's last known address, which asks the provider nothing; only when
 * nothing answers there (a stopped or moved sandbox) is it woken, and the call
 * made once more. A call host-service answered, error or not, is never
 * repeated, and a mutation is repeated only after a stopped box's 410.
 */
export async function workspaceServiceCall<TOutput>(
	input: { hostId?: string; workspaceId: string },
	ctx: McpContext,
	procedure: string,
	method: "query" | "mutation",
	payload?: unknown,
): Promise<TOutput> {
	if (input.hostId) {
		return hostServiceCall<TOutput>(
			{
				relayUrl: ctx.relayUrl,
				organizationId: ctx.organizationId,
				hostId: input.hostId,
				jwt: ctx.bearerToken,
			},
			procedure,
			method,
			payload,
		);
	}
	await requireCloudUnlessHost(input, ctx);
	const caller = createMcpCaller(ctx);
	const access = createSandboxAccess(async (id, wake) => {
		const granted = wake
			? await caller.cloudWorkspace.access({ id, wake: true })
			: await caller.cloudWorkspace.hostTicket({ id });
		return {
			url: granted.url,
			token: granted.token,
			expiresAt: new Date(granted.expiresAt).getTime(),
		};
	});
	return callWithWake({
		access,
		workspaceId: input.workspaceId,
		call: (grant) =>
			hostServiceCall<TOutput>(
				{
					gateUrl: grant.url,
					ticket: grant.token,
					workspaceId: input.workspaceId,
				},
				procedure,
				method,
				payload,
			),
		isUnanswered: (error) => canWakeAndRetry(method, error),
	});
}
