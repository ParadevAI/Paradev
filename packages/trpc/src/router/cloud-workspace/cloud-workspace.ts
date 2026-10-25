import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	cloudWorkspaceTags,
	cloudWorkspaceVisibilityEnum,
	environments,
	githubRepositories,
	users,
} from "@superset/db/schema";
import { MACHINE_SIZES, machineSpec } from "@superset/shared/billing";
import {
	CLOUD_AGENT_PROMPT_MAX_LENGTH,
	isCloudAgentId,
} from "@superset/shared/cloud-agent-launch";
import {
	normalizeWorkspaceTags,
	workspaceTagsInputSchema,
} from "@superset/shared/workspace-tags";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { organizationMachineSizes } from "../../lib/billing/plan";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { nudge } from "../../lib/realtime";
import {
	deleteSandbox,
	describeSandbox,
	HOST_SERVICE_PORT,
	listRemoteBranches,
	loadRepositories,
	mintSandboxGateAccess,
	primaryRepository,
	SandboxNotReadyError,
	SandboxUnavailableError,
	sandboxExists,
	stopAndSnapshot,
} from "../../lib/sandbox";
import { pushWorkspaceAccess } from "../../lib/workspace-access";
import { jwtProcedure, userError } from "../../trpc";
import { hostServiceMutation } from "../automation/relay-client";
import { ensureDefaultEnvironment } from "../environment/default-environment";
import { regionForRequest } from "../environment/region-for-request";
import {
	canOpenWorkspace,
	isListed,
	loadVisibleWorkspace,
	notFound,
	visibleTo,
} from "./access";
import { recordCloudWorkspaceActivity } from "./activity";
import { queueSettleWorkspace, settleWorkspaceNow } from "./meter";
import { nextSandboxNameFor } from "./provision";
import { listPullRequests } from "./pull-requests";
import { queueReap } from "./reap";
import { cloudWorkspaceRecordRouter } from "./record";
import { cloudWorkspaceSharingRouter } from "./sharing";
import { queueProvision, startCloudWorkspace } from "./start";
import { transitionCloudWorkspace } from "./transition";
import {
	markSandboxUnavailable,
	restartCloudWorkspace,
	wakeCloudWorkspace,
} from "./wake";

const DESCRIPTION_PROMPT = [
	"Write this workspace's description for a teammate who has not seen it:",
	"what was asked, what is done, what is in progress or blocked, and any open pull requests.",
	'Read the git log, the diff against the default branch, and `gh pr list --head "$(git branch --show-current)"` to find out; do not change any files.',
	"Keep it to 2-4 sentences of markdown, and save it by piping it on stdin:",
	"`superset workspaces description set <<'EOF'` followed by the description and `EOF`.",
].join(" ");

/** The caller's cloud workspace, refused unless it exists, they may use it, and it is ready. */
async function loadReadyWorkspace(
	ctx: Parameters<typeof assertCloudAccess>[0] & { organizationIds: string[] },
	id: string,
) {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row) {
		throw userError({
			code: "NOT_FOUND",
			message: "Not found",
			i18nKey: "serverError.cloudWorkspace.notFound",
		});
	}
	assertMember(ctx.organizationIds, row.organizationId);
	await assertCloudAccess(ctx, row.organizationId);
	if (!(await canOpenWorkspace(row, ctx.userId))) throw notFound();
	if (row.status !== "ready") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Cloud workspace is ${row.status}`,
			cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: row.status },
		});
	}
	return row;
}

/**
 * Where this workspace's host-service answers. A wake resumes a stopped
 * session and records a moved address, and a restart stops a running one
 * first; a sandbox that can never resume turns the row failed, the state
 * clients already offer a way out of.
 */
async function addressSandbox(
	row: typeof cloudWorkspaces.$inferSelect,
	mode: "address" | "wake" | "restart",
): Promise<{
	hostTarget: string;
	running: boolean;
	agentCredentialsChanged: boolean;
}> {
	try {
		if (mode === "address") {
			return {
				...(await describeSandbox(row.providerSandboxId)),
				agentCredentialsChanged: false,
			};
		}
		const woken =
			mode === "restart"
				? await restartCloudWorkspace(row)
				: await wakeCloudWorkspace(row);
		return { ...woken, running: true };
	} catch (error) {
		if (error instanceof SandboxNotReadyError) {
			throw new TRPCError({
				code: "TIMEOUT",
				message: "Cloud workspace is still starting",
				cause: error,
			});
		}
		if (!(error instanceof SandboxUnavailableError)) throw error;
		await markSandboxUnavailable(row, error);
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Cloud workspace is failed",
			cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: "failed" },
		});
	}
}

/** The caller's own tags per workspace, normalized and sorted; ids with none are absent. */
async function loadCallerTags(
	workspaceIds: string[],
	userId: string,
): Promise<Map<string, string[]>> {
	const byWorkspaceId = new Map<string, string[]>();
	if (workspaceIds.length === 0) return byWorkspaceId;
	const rows = await db
		.select({
			cloudWorkspaceId: cloudWorkspaceTags.cloudWorkspaceId,
			tag: cloudWorkspaceTags.tag,
		})
		.from(cloudWorkspaceTags)
		.where(
			and(
				inArray(cloudWorkspaceTags.cloudWorkspaceId, workspaceIds),
				eq(cloudWorkspaceTags.createdByUserId, userId),
			),
		);
	for (const row of rows) {
		const tags = byWorkspaceId.get(row.cloudWorkspaceId);
		if (tags) tags.push(row.tag);
		else byWorkspaceId.set(row.cloudWorkspaceId, [row.tag]);
	}
	for (const [id, tags] of byWorkspaceId) {
		byWorkspaceId.set(id, normalizeWorkspaceTags(tags));
	}
	return byWorkspaceId;
}

/**
 * Released desktop and mobile builds still read `presence`; it now lives in the realtime WorkspaceHub.
 * TODO(2026-10-26): drop `presence` from list and create once MINIMUM_DESKTOP_VERSION is past the release that stopped reading it.
 */
const NO_PRESENCE: {
	userId: string;
	name: string;
	image: string | null;
	lastSeenAt: Date;
}[] = [];

export const cloudWorkspaceRouter = {
	...cloudWorkspaceRecordRouter,
	sharing: cloudWorkspaceSharingRouter,

	/**
	 * Whether this account may use cloud workspaces. Clients decide their
	 * default location from it: a workspace command defaults to the cloud only
	 * for an account that can use it, so nobody else's commands change.
	 */
	available: jwtProcedure.query(async ({ ctx }) => {
		try {
			await assertCloudAccess(ctx, ctx.activeOrganizationId ?? null);
			return { available: true };
		} catch {
			return { available: false };
		}
	}),

	list: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				archived: z.boolean().default(false),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			const rows = await db
				.select({
					workspace: cloudWorkspaces,
					createdBy: { userId: users.id, name: users.name, image: users.image },
				})
				.from(cloudWorkspaces)
				.leftJoin(users, eq(cloudWorkspaces.createdByUserId, users.id))
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
						isListed(input.archived),
					),
				)
				.orderBy(desc(cloudWorkspaces.createdAt));
			const tagsByWorkspaceId = await loadCallerTags(
				rows.map(({ workspace }) => workspace.id),
				ctx.userId,
			);
			return rows.map(({ workspace, createdBy }) => ({
				...workspace,
				createdBy,
				presence: NO_PRESENCE,
				tags: tagsByWorkspaceId.get(workspace.id) ?? [],
			}));
		}),

	/**
	 * The repositories each listed workspace checked out, by name, the one it
	 * opens on marked primary.
	 */
	repositories: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			const rows = await db
				.select({
					cloudWorkspaceId: cloudWorkspaceRepositories.cloudWorkspaceId,
					repositoryId: githubRepositories.id,
					fullName: githubRepositories.fullName,
					path: cloudWorkspaceRepositories.path,
					primaryRepositoryId: environments.primaryRepositoryId,
				})
				.from(cloudWorkspaceRepositories)
				.innerJoin(
					cloudWorkspaces,
					eq(cloudWorkspaceRepositories.cloudWorkspaceId, cloudWorkspaces.id),
				)
				.innerJoin(
					environments,
					eq(cloudWorkspaces.environmentId, environments.id),
				)
				.innerJoin(
					githubRepositories,
					eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
				)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
					),
				)
				.orderBy(asc(githubRepositories.fullName));
			const primaryByWorkspace = new Map<string, string>();
			for (const workspaceId of new Set(rows.map((r) => r.cloudWorkspaceId))) {
				const own = rows.filter((r) => r.cloudWorkspaceId === workspaceId);
				const primary = primaryRepository(
					own.map((r) => ({ id: r.repositoryId, fullName: r.fullName })),
					own[0]?.primaryRepositoryId,
				);
				if (primary) primaryByWorkspace.set(workspaceId, primary.id);
			}
			return rows.map(({ primaryRepositoryId: _primary, ...row }) => ({
				...row,
				primary:
					primaryByWorkspace.get(row.cloudWorkspaceId) === row.repositoryId,
			}));
		}),

	pullRequests: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				archived: z.boolean().default(false),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			return listPullRequests(input.organizationId, ctx.userId, input.archived);
		}),

	machineSizes: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			const { sizes, defaultSize } = await organizationMachineSizes(
				input.organizationId,
			);
			return {
				defaultSize,
				sizes: sizes.map((name) => ({ name, ...machineSpec(name) })),
			};
		}),

	listBranches: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repositoryId: z.string().uuid(),
				query: z.string().max(200).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			const [repo] = await loadRepositories({
				organizationId: input.organizationId,
				repositoryIds: [input.repositoryId],
			}).catch(() => []);
			if (!repo) return { defaultBranch: null, items: [] };
			return listRemoteBranches(repo, input.query);
		}),

	/** See {@link startCloudWorkspace}. */
	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				/** Omitted when the user didn't type one; then `prompt` names it. */
				name: z.string().min(1).max(200).optional(),
				prompt: z.string().max(CLOUD_AGENT_PROMPT_MAX_LENGTH).optional(),
				/** Omitted = the repo's default branch, resolved here — a client
				 * whose branch query hadn't answered must not guess "main". */
				branch: z.string().min(1).max(300).optional(),
				/** Required in practice; optional only while `repositoryId` is accepted. */
				environmentId: z.string().uuid().optional(),
				/**
				 * @deprecated desktop 1.39.x sends this when no environment covers the
				 * repository; the API then makes one. Newer clients send `environmentId`.
				 * Remove with `ensureDefaultEnvironment` once MINIMUM_DESKTOP_VERSION
				 * passes 1.39.x.
				 */
				repositoryId: z.string().uuid().optional(),
				/**
				 * A built-in agent to launch on first boot with `prompt`. Absent
				 * means the workspace comes up idle.
				 */
				agent: z.string().min(1).optional(),
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
				mode: z.string().min(1).optional(),
				/**
				 * Cloud uploads to hand the agent with `prompt`. The box pulls the
				 * bytes once it is up; the same cap `attachments.importFromCloud`
				 * takes, since that is what runs in there.
				 */
				attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
				/** What the person typed, kept as the workspace's prompt; `prompt` may carry built context. */
				typedPrompt: z.string().max(20000).optional(),
				/** Tasks the composer linked; each must be in this organization. */
				taskIds: z.array(z.string().uuid()).max(10).optional(),
				/** A size the organization offers (see `machineSizes`); omitted = its default. */
				machineSize: z.enum(MACHINE_SIZES).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			if (input.agent && !isCloudAgentId(input.agent)) {
				// Only the built-in presets exist inside a sandbox; the clients offer
				// nothing else, so this is a developer error, not a user one.
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown agent "${input.agent}"`,
				});
			}

			const environmentId =
				input.environmentId ??
				(input.repositoryId
					? (
							await ensureDefaultEnvironment({
								organizationId: input.organizationId,
								repositoryId: input.repositoryId,
								userId: ctx.userId,
								region: regionForRequest(ctx.headers),
							})
						).id
					: null);
			if (!environmentId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "environmentId or repositoryId is required",
				});
			}

			const row = await startCloudWorkspace({
				organizationId: input.organizationId,
				userId: ctx.userId,
				environmentId,
				name: input.name,
				prompt: input.prompt,
				branch: input.branch,
				typedPrompt: input.typedPrompt,
				taskIds: input.taskIds,
				attachmentFileIds: input.attachmentFileIds,
				machineSize: input.machineSize,
				...(input.agent
					? {
							launch: {
								agent: input.agent,
								prompt: input.prompt ?? "",
								model: input.model,
								effort: input.effort,
								mode: input.mode,
								attachmentFileIds: input.attachmentFileIds,
							},
						}
					: {}),
			});
			// Shaped like a `list` row: clients seed the list with it.
			const creator = await db.query.users.findFirst({
				where: eq(users.id, ctx.userId),
				columns: { id: true, name: true, image: true },
			});
			return {
				...row,
				createdBy: creator
					? { userId: creator.id, name: creator.name, image: creator.image }
					: null,
				presence: NO_PRESENCE,
				tags: [] as string[],
			};
		}),

	/**
	 * The workspace's name lives here, not on the sandbox. A cloud workspace
	 * is created, named and listed by this API; the row inside the sandbox
	 * exists only so host-service has something to serve panes against.
	 */
	rename: jwtProcedure
		.input(
			z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [renamed] = await db
				.update(cloudWorkspaces)
				.set({ name: input.name })
				.where(eq(cloudWorkspaces.id, input.id))
				.returning();
			if (input.name !== row.name) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ fromName: row.name, toName: input.name },
				);
			}
			nudge(row.organizationId, "cloud_workspaces");
			return renamed ?? row;
		}),

	/**
	 * Replaces the caller's tag set on a workspace — the sidebar's folder
	 * membership, the same contract as host-service `workspace.update`. Tags
	 * are personal, so anyone who can see the workspace may file it, and only
	 * their own rows move.
	 */
	setTags: jwtProcedure
		.input(z.object({ id: z.string().uuid(), tags: workspaceTagsInputSchema }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			await dbWs.transaction(async (tx) => {
				// One replace-set write at a time per (workspace, user): two
				// that overlap would each delete past the other's insert and
				// leave the union of both sets.
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${`${row.id}:${ctx.userId}`}))`,
				);
				await tx
					.delete(cloudWorkspaceTags)
					.where(
						and(
							eq(cloudWorkspaceTags.cloudWorkspaceId, row.id),
							eq(cloudWorkspaceTags.createdByUserId, ctx.userId),
						),
					);
				if (input.tags.length > 0) {
					await tx.insert(cloudWorkspaceTags).values(
						input.tags.map((tag) => ({
							cloudWorkspaceId: row.id,
							tag,
							createdByUserId: ctx.userId,
						})),
					);
				}
			});
			// Tags are personal, but the caller's other windows learn of the
			// change only through the organization channel.
			nudge(row.organizationId, "cloud_workspaces");
			return { ...row, tags: input.tags };
		}),

	/**
	 * Checks org membership, then mints the tickets for this workspace's ports.
	 *
	 * This is the *only* gate. A sandbox's ports are public URLs; the gate
	 * Worker admits a request by ticket and presents the host secret to the
	 * box, so whoever holds an unexpired ticket has terminals, git, files and
	 * the desktop. Hence the checks running before anything is minted.
	 *
	 * `wake` is the difference between addressing a workspace and using it: a
	 * client keeps a live address for everything it lists, and that must not
	 * keep every sandbox running. Only the open workspace asks to be woken,
	 * which resumes a stopped session, re-applies the credential rules,
	 * extends a running session, and pushes the managed environment again.
	 */
	access: jwtProcedure
		.input(
			z.object({ id: z.string().uuid(), wake: z.boolean().default(false) }),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const address = await addressSandbox(
				row,
				input.wake ? "wake" : "address",
			);
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target: address.hostTarget,
			});
			return {
				url: host.url,
				token: host.token,
				expiresAt: host.expiresAt,
				running: address.running,
				agentCredentialsChanged: address.agentCredentialsChanged,
				// The display is served by host-service too: same address, same
				// ticket. The sandbox's own desktop port is not published.
				desktop: { url: host.url, token: host.token },
			};
		}),

	/** Ends every terminal and agent on the box so they start again with the current agent sign-ins. */
	restart: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			await addressSandbox(row, "restart");
			return { restarted: true };
		}),

	/** Stops the sandbox so it costs storage only; the next `access` with `wake` boots it again. */
	sleep: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const { running } = await addressSandbox(row, "address");
			if (running) {
				await stopAndSnapshot(row.providerSandboxId);
				await queueSettleWorkspace(row.id);
			}
			return { stopped: running };
		}),

	/**
	 * A ticket for host-service in this workspace's sandbox at its last known
	 * address, without asking the provider. For callers that reach the box
	 * right away (CLI, MCP, SDK): a stopped sandbox, or one whose address moved
	 * on resume, does not answer it, and they then ask `access` with `wake`,
	 * which also records the current address.
	 */
	/**
	 * Asks an agent in the box to write the workspace's description; it saves it
	 * with `superset workspaces description set`, which lands as `setDescription`.
	 */
	generateDescription: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				agent: z.string().refine(isCloudAgentId).default("claude"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const address = await addressSandbox(row, "wake");
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target: address.hostTarget,
			});
			await hostServiceMutation(
				{
					baseUrl: host.url,
					headers: { authorization: `Bearer ${host.token}` },
					timeoutMs: 60_000,
				},
				"agents.run",
				{ workspaceId: row.id, agent: input.agent, prompt: DESCRIPTION_PROMPT },
			);
			return { requestedAt: new Date(), previous: row.description };
		}),

	hostTicket: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const target =
				row.sandboxUrl ??
				(await describeSandbox(row.providerSandboxId)).hostTarget;
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target,
			});
			return { url: host.url, token: host.token, expiresAt: host.expiresAt };
		}),

	setVisibility: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				visibility: cloudWorkspaceVisibilityEnum,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			if (row.createdByUserId !== ctx.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the creator can change who sees a cloud workspace",
				});
			}
			await db
				.update(cloudWorkspaces)
				.set({ visibility: input.visibility })
				.where(eq(cloudWorkspaces.id, input.id));
			if (input.visibility !== row.visibility) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ fromVisibility: row.visibility, toVisibility: input.visibility },
				);
			}
			if (input.visibility !== row.visibility) {
				pushWorkspaceAccess(row.organizationId, row.id);
			}
			nudge(row.organizationId, "cloud_workspaces");
			return { visibility: input.visibility };
		}),

	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
			});
			if (!row) return { deleted: false };
			assertMember(ctx.organizationIds, row.organizationId);
			await assertCloudAccess(ctx, row.organizationId);
			if (!(await canOpenWorkspace(row, ctx.userId))) {
				return { deleted: false };
			}

			const archivedAt = new Date();
			// From any state, provisioning included: the job checks the row
			// before it marks it ready and tears its box down when this won.
			// The box keeps running until the reap stops it, so an undo is instant.
			const archived = await transitionCloudWorkspace({
				id: row.id,
				from: ["provisioning", "ready", "failed"],
				to: "deleted",
				set: { sandboxUrl: null, deletedAt: archivedAt },
			});
			if (archived) {
				// A row from a retired provider has no sandbox left to keep.
				if (row.provider === "vercel") {
					await queueReap(
						{ cloudWorkspaceId: row.id, archivedAt: archivedAt.toISOString() },
						row.providerSandboxId,
					).catch(async (error) => {
						console.error(
							`[cloud-workspace] could not queue the reap for ${row.id}`,
							error,
						);
						await settleWorkspaceNow(row.id).catch((meterError) =>
							console.error(
								`[cloud-workspace] ${row.id} final meter failed`,
								meterError,
							),
						);
						await deleteSandbox(row.providerSandboxId);
					});
				}
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ event: "archived" },
				).catch((error) => {
					console.error(
						`[cloud-workspace] ${row.id} archive activity write failed`,
						error,
					);
				});
			}
			nudge(row.organizationId, "cloud_workspaces");
			return { deleted: true };
		}),

	unarchive: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const resumable =
				row.status === "deleted" &&
				row.provider === "vercel" &&
				(await sandboxExists(row.providerSandboxId));
			// Inside the grace period the box is still there, running for the
			// first minute and stopped after, and wakes with its disk; after it, the row gets a fresh box from its
			// environment and nothing on the old disk comes back.
			const revived = await transitionCloudWorkspace(
				resumable
					? {
							id: row.id,
							from: ["deleted"],
							to: "ready",
							set: { deletedAt: null },
						}
					: {
							id: row.id,
							from: ["deleted"],
							to: "provisioning",
							set: {
								provider: "vercel",
								providerSandboxId: nextSandboxNameFor(row.id),
								sandboxUrl: null,
								deletedAt: null,
							},
						},
			);
			if (!revived) return { unarchived: false };
			await recordCloudWorkspaceActivity(
				db,
				row.id,
				{ kind: "user", userId: ctx.userId },
				{ event: "unarchived" },
			);
			nudge(row.organizationId, "cloud_workspaces");
			if (!resumable) await queueProvision({ cloudWorkspaceId: row.id });
			return { unarchived: true };
		}),
} satisfies TRPCRouterRecord;
