import { timingSafeEqual } from "node:crypto";
import type { auth, Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import {
	agents,
	agentTurns,
	cloudWorkspaces,
	members,
} from "@superset/db/schema";
import {
	ORGANIZATION_HEADER,
	STAFF_EMAIL_DOMAINS,
} from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import superjson from "superjson";
import { env } from "./env";
import { formatError, userError } from "./i18n-error";
import { hasAdminAccess } from "./lib/admin-access";
import {
	TURN_TOKEN_HEADER,
	verifyTurnToken,
} from "./lib/agent-turn/turn-token";
import { posthog } from "./lib/analytics";
import {
	SANDBOX_ALLOWED_PROCEDURES,
	type SandboxCaller,
} from "./lib/sandbox/api-credential";
import { tokenOrganizationIds } from "./lib/token-organizations";
import {
	actorOf,
	type DevPrincipal,
	type PersonPrincipal,
	type Principal,
} from "./principal";

export type { I18nErrorCause, RequiredPlan } from "./i18n-error";
export { isI18nErrorCause, planRequiredError, userError } from "./i18n-error";

export interface ApiClientInfo {
	product: "desktop" | "mobile" | "cli" | "sdk";
	version: string;
}

export const CLIENT_VERSION_HEADER = "x-superset-client";

const CLIENT_HEADER_PATTERN =
	/^(desktop|mobile|cli|sdk)\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

// Absent or unparseable header = web or a pre-header build, both treated as
// always-current.
export function parseClientHeader(headers: Headers): ApiClientInfo | null {
	const match = headers
		.get(CLIENT_VERSION_HEADER)
		?.match(CLIENT_HEADER_PATTERN);
	const product = match?.[1];
	const version = match?.[2];
	if (!product || !version) return null;
	return { product: product as ApiClientInfo["product"], version };
}

/**
 * Set when a request arrived over a transport only agents use — today that is
 * the MCP server, which `packages/mcp` marks when it builds its caller.
 * Derived from the transport, never from the request body, so it is safe to
 * attribute a write to an agent on the strength of it.
 *
 * Deliberately NOT set for the CLI. `superset` authenticates with the user's
 * own OAuth bearer or API key, identically whether a human typed the command
 * or an agent running in a pane did — the server cannot tell those apart. A
 * CLI agent self-reports instead (see `agentSessionId` on the page-comment
 * reply input), which is a hint, not an attestation. Don't treat the absence
 * of `agentCaller` as proof a human is calling.
 */
export type AgentCaller = { transport: "mcp"; label: string | null };

export type TRPCContext = {
	session: Session | null;
	auth: typeof auth;
	headers: Headers;
	client: ApiClientInfo | null;
	agentCaller: AgentCaller | null;
	/**
	 * Set when a cloud workspace is acting for itself, with the credential the
	 * firewall adds on its way out. It carries the creator's identity, so the
	 * procedures it may reach are an allowlist, not everything they can do.
	 */
	sandboxCaller: SandboxCaller | null;
	/**
	 * The cloud workspace whose box sent this request, from the same
	 * credential. The box itself, not a person: set even when the workspace has
	 * no creator, and what `sandboxProcedure` requires.
	 */
	sandboxWorkspaceId: string | null;
};

export const createTRPCContext = (
	opts: Omit<
		TRPCContext,
		"client" | "agentCaller" | "sandboxCaller" | "sandboxWorkspaceId"
	> & {
		agentCaller?: AgentCaller | null;
		sandboxCaller?: SandboxCaller | null;
		sandboxWorkspaceId?: string | null;
	},
): TRPCContext => ({
	...opts,
	client: parseClientHeader(opts.headers),
	agentCaller: opts.agentCaller ?? null,
	sandboxCaller: opts.sandboxCaller ?? null,
	sandboxWorkspaceId: opts.sandboxWorkspaceId ?? null,
});

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return formatError({ shape, error });
	},
});

/**
 * A box may only reach what `superset` inside it needs. Everything else is a
 * person's call, made from a client they signed into — the credential is
 * unstealable, but every process in the box can use it.
 */
const sandboxScope = t.middleware(async ({ ctx, path, next }) => {
	if (ctx.sandboxCaller && !SANDBOX_ALLOWED_PROCEDURES.has(path)) {
		throw userError({
			code: "FORBIDDEN",
			message: `A cloud workspace cannot call ${path}. Run this from a client you are signed into.`,
			i18nKey: "serverError.common.cloudWorkspaceCannotCallThis",
			params: { path },
		});
	}
	return next();
});

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

const API_CALL_SAMPLE_RATE = 0.01;

// Per-procedure, per-client-version usage telemetry: the evidence source for
// deprecating procedures once no in-window client version still calls them.
function captureApiCall(
	client: ApiClientInfo | null,
	distinctId: string,
	path: string,
) {
	if (!client || Math.random() >= API_CALL_SAMPLE_RATE) return;
	posthog.capture({
		distinctId,
		event: "api_procedure_called",
		properties: {
			procedure: path,
			client_product: client.product,
			client_version: client.version,
		},
	});
}

const clientTelemetry = t.middleware(async ({ ctx, path, next }) => {
	captureApiCall(
		ctx.client,
		ctx.session?.user.id ?? "api-unauthenticated",
		path,
	);
	return next();
});

export const publicProcedure = t.procedure.use(clientTelemetry);

const personPrincipal = (
	userId: string,
	organizationId: string | null,
): PersonPrincipal => ({ kind: "person", userId, organizationId });

/** The only procedures a pending-deletion account may call. */
const PENDING_DELETION_ALLOWED_PROCEDURES = new Set([
	"user.me",
	"user.deleteAccount",
	"user.reactivateAccount",
]);

/**
 * A box calling about its own workspace, which must still exist: an archived
 * box keeps running until the reap stops it. Anything running in the box can
 * call these, so each must be safe for an agent to call on its own workspace.
 */
export const sandboxProcedure = t.procedure.use(async ({ ctx, next }) => {
	const workspace = ctx.sandboxWorkspaceId
		? await db.query.cloudWorkspaces.findFirst({
				where: and(
					eq(cloudWorkspaces.id, ctx.sandboxWorkspaceId),
					isNull(cloudWorkspaces.deletedAt),
				),
				columns: {
					id: true,
					organizationId: true,
					providerSandboxId: true,
					status: true,
				},
			})
		: undefined;
	if (!workspace) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Only a live cloud workspace's box can call this.",
		});
	}
	return next({ ctx: { ...ctx, sandboxWorkspace: workspace } });
});

async function personFromSession(ctx: TRPCContext, path: string) {
	const { session } = ctx;
	if (!session) {
		throw userError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
			i18nKey: "serverError.common.notAuthenticatedPleaseSignIn",
		});
	}
	if (
		session.user.deletionRequestedAt &&
		!PENDING_DELETION_ALLOWED_PROCEDURES.has(path)
	) {
		throw userError({
			code: "FORBIDDEN",
			message: "Account is pending deletion.",
			i18nKey: "serverError.common.accountIsPendingDeletion",
		});
	}
	const sessionOrgId = session.session.activeOrganizationId ?? null;
	const headerOrgId = ctx.headers.get(ORGANIZATION_HEADER)?.trim() || null;
	assertInBoxOrganization(ctx.sandboxCaller, headerOrgId);

	let activeOrganizationId = sessionOrgId;
	if (headerOrgId && headerOrgId !== sessionOrgId) {
		const membership =
			tokenOrganizationIds(session)?.includes(headerOrgId) ||
			(await db.query.members.findFirst({
				where: and(
					eq(members.userId, session.user.id),
					eq(members.organizationId, headerOrgId),
				),
			}));
		if (!membership) {
			throw notAMemberOfOrganization(headerOrgId, session.user.email);
		}
		activeOrganizationId = headerOrgId;
	}
	return {
		session,
		activeOrganizationId,
		principal: personPrincipal(session.user.id, activeOrganizationId),
	};
}

/**
 * A Dev inside a running turn, from a turn token in its own header and
 * signed with its own key, so it can never pass as a user's JWT. A settled
 * turn, or an archived Dev, stops working at once rather than when the token
 * expires. Null when the request carries no turn token.
 */
async function devFromTurnToken(
	headers: Headers,
): Promise<DevPrincipal | null> {
	const token = headers.get(TURN_TOKEN_HEADER);
	if (!token) return null;
	const claims = await verifyTurnToken(env.AGENT_TURN_SIGNING_SECRET, token);
	if (!claims) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Bad turn token." });
	}
	const [turn] = await db
		.select({
			status: agentTurns.status,
			archivedAt: agents.archivedAt,
			ownerId: agents.createdByUserId,
		})
		.from(agentTurns)
		.innerJoin(agents, eq(agents.id, agentTurns.agentId))
		.where(
			and(
				eq(agentTurns.id, claims.turnId),
				eq(agentTurns.sessionId, claims.sessionId),
				eq(agentTurns.agentId, claims.agentId),
				eq(agentTurns.organizationId, claims.organizationId),
			),
		)
		.limit(1);
	if (!turn || turn.status !== "running" || turn.archivedAt) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Turn is not running.",
		});
	}
	const ownerAsks =
		turn.ownerId !== null && claims.actingUserId === turn.ownerId;
	return {
		kind: "dev",
		agentId: claims.agentId,
		organizationId: claims.organizationId,
		ownerId: turn.ownerId,
		askerId: claims.actingUserId,
		ownerAsks,
		sessionId: claims.sessionId,
		turnId: claims.turnId,
	};
}

/**
 * Anyone who may call: a Dev with a turn token, or a signed-in person.
 * Procedures on it check access with `ctx.principal`, never the session.
 */
export const actorProcedure = t.procedure
	.use(sandboxScope)
	.use(async ({ ctx, path, next }) => {
		const dev = await devFromTurnToken(ctx.headers);
		const caller = dev
			? {
					session: null,
					activeOrganizationId: dev.organizationId,
					principal: dev as Principal,
				}
			: await personFromSession(ctx, path);
		captureApiCall(ctx.client, actorOf(caller.principal), path);
		return next({
			ctx: { ...ctx, ...caller, principal: caller.principal as Principal },
		});
	});

/** A signed-in person only. */
export const personProcedure = actorProcedure.use(({ ctx, next }) => {
	const { principal, session } = ctx;
	if (principal.kind !== "person" || !session) {
		throw userError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
			i18nKey: "serverError.common.notAuthenticatedPleaseSignIn",
		});
	}
	return next({ ctx: { ...ctx, session, principal } });
});

/** A Dev inside a running turn only. */
export const devProcedure = actorProcedure.use(({ ctx, next }) => {
	const { principal } = ctx;
	if (principal.kind !== "dev") {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "No turn token." });
	}
	return next({ ctx: { ...ctx, principal } });
});

/**
 * Callers pass the organization in a header (the CLI sends
 * SUPERSET_ORGANIZATION_ID, or the organization it last logged into), so the
 * id in this error is usually one the caller never typed. Saying where it
 * came from is what turns "not a member" into something actionable.
 *
 * A Superset terminal sets SUPERSET_ORGANIZATION_ID to its workspace's
 * organization. A CLI there that cannot use the app's account (an older host,
 * or SUPERSET_API_KEY set) and holds another account's login fails here.
 */
function notAMemberOfOrganization(
	organizationId: string,
	signedInAs?: string,
): TRPCError {
	const account = signedInAs ? ` (signed in as ${signedInAs})` : "";
	return new TRPCError({
		code: "FORBIDDEN",
		message: `Not a member of organization ${organizationId}, which was asked for in the x-superset-organization-id header${account}. Run \`superset auth login\` with an account in that organization, or unset SUPERSET_API_KEY if it names another account.`,
	});
}

/** A box's credential is its creator's, but it acts in the box's organization only. */
function assertInBoxOrganization(
	sandboxCaller: SandboxCaller | null,
	organizationId: string | null,
) {
	if (
		sandboxCaller &&
		organizationId &&
		organizationId !== sandboxCaller.organizationId
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `A cloud workspace can only act in its own organization, not ${organizationId}`,
		});
	}
}

export const adminProcedure = personProcedure.use(async ({ ctx, next }) => {
	if (!hasAdminAccess(ctx.session.user)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires a verified ${STAFF_EMAIL_DOMAINS.join(" or ")} email.`,
		});
	}

	return next({ ctx });
});

export const AGENT_WORKER_SECRET_HEADER = "x-agent-worker-secret";

/** Our agent worker, which may only pick up turns the API created. */
export const workerProcedure = t.procedure.use(async ({ ctx, next }) => {
	const expected = Buffer.from(env.AGENT_WORKER_SECRET);
	const given = Buffer.from(ctx.headers.get(AGENT_WORKER_SECRET_HEADER) ?? "");
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unknown worker." });
	}
	return next();
});
