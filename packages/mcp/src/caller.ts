import { auth, type Session } from "@superset/auth/server";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import {
	createCaller as makeAppCaller,
	TURN_TOKEN_HEADER,
} from "@superset/trpc";
import type { DevMcpContext, McpContext, PersonMcpContext } from "./auth";

export type McpCaller = ReturnType<typeof makeAppCaller>;

/** A tRPC server-side caller acting as whoever called the MCP server. */
export function createMcpCaller(ctx: McpContext): McpCaller {
	return ctx.kind === "dev" ? devCaller(ctx) : personCaller(ctx);
}

/** The turn token goes on as-is; `actorProcedure` checks it on every call. */
function devCaller(ctx: DevMcpContext): McpCaller {
	return makeAppCaller({
		session: null,
		auth,
		headers: new Headers({ [TURN_TOKEN_HEADER]: ctx.turnToken }),
		client: null,
		agentCaller: { transport: "mcp", label: ctx.clientLabel },
		sandboxCaller: null,
		sandboxWorkspaceId: null,
	});
}

/**
 * Synthesizes the same shape `apps/api/src/trpc/context.ts` produces for HTTP
 * requests, so `personProcedure` accepts it:
 * - `session` carries `user.id` + `session.activeOrganizationId`.
 * - `headers` carries the minted JWT in `Authorization` + the active org id in
 *   the `x-superset-organization-id` header, so org-scoped middleware reads the
 *   right org.
 *
 * The minted JWT is reused across all calls in this request — the caller is
 * cheap to construct and tools call only one procedure each.
 */
function personCaller(ctx: PersonMcpContext): McpCaller {
	const headers = new Headers();
	headers.set("authorization", `Bearer ${ctx.bearerToken}`);
	headers.set(ORGANIZATION_HEADER, ctx.organizationId);

	const session = {
		user: {
			id: ctx.userId,
			email: ctx.email,
			emailVerified: true,
			name: ctx.email,
			image: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
		session: {
			id: `mcp-${ctx.requestId}`,
			userId: ctx.userId,
			activeOrganizationId: ctx.organizationId,
			organizationIds: ctx.organizationIds,
			expiresAt: new Date(Date.now() + 5 * 60_000),
			token: ctx.bearerToken,
			ipAddress: null,
			userAgent: "mcp-v2",
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
	} as unknown as Session;

	return makeAppCaller({
		session,
		auth,
		headers,
		client: null,
		// The one place the server learns, from the transport rather than from a
		// request body, that an agent is calling. Procedures that attribute or
		// gate on "is this an agent" read this.
		agentCaller: { transport: "mcp", label: ctx.clientLabel },
		sandboxCaller: null,
		sandboxWorkspaceId: null,
	});
}
