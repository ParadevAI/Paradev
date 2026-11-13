import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MACHINE_SIZES, type MachineSize } from "@superset/shared/billing";
import {
	describeEnvironments,
	selectCloudEnvironment,
	startableCloudEnvironments,
} from "@superset/shared/cloud-environments";
import { z } from "zod";
import type { McpContext } from "../../auth";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { requireCloudUnlessHost } from "../../workspace-service-target";

const agentLaunchSchema = z.object({
	agent: z
		.string()
		.min(1)
		.describe(
			"Agent preset id (e.g. `claude`, `codex`, `superset`) or HostAgentConfig instance UUID.",
		),
	prompt: z.string().min(1).describe("Initial prompt the agent starts with."),
	model: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Model for this launch. Supported values depend on the agent; omit to use its default.",
		),
	effort: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Reasoning effort for this launch. Supported values depend on the agent; omit to use its default.",
		),
	attachmentIds: z
		.array(z.string().uuid())
		.optional()
		.describe(
			"Host-scoped attachment UUIDs. The host resolves these to absolute paths and appends them to the prompt.",
		),
});

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_create",
		annotations: { destructiveHint: false },
		description:
			"Create a workspace. Without hostId it is a cloud workspace: it starts from `environment` (by id — a create without one, when several exist, fails listing the ids; its repositories are the checkouts; required when several environments have repositories), runs on Paradev's infrastructure so it keeps going when the user's laptop sleeps, and returns as soon as its row exists in status 'provisioning' — poll workspaces_list until it is 'ready'. It bills until deleted, so call workspaces_delete when the work is done. A cloud workspace takes `name`, `branch`, `machineSize` and at most one entry in `agents` (claude or codex); host-only fields are rejected. With hostId it is created on that host (see projects_list and hosts_list): use `checkout: local` to share the project checkout without switching branches, or omit checkout for an isolated worktree with a branch or PR (`pr` and `baseBranch` apply to the project's primary repository, or to `repository` in a project with several); omit `projectId` (and `branch`/`pr`/`baseBranch`/`repository`/`taskId`) for a project-less session. `agents` spawns agents once the workspace is ready (the equivalent of agents_create) and `command` runs a one-off shell command.",
		inputSchema: {
			checkout: z
				.enum(["worktree", "local"])
				.optional()
				.describe(
					"Where files live. Local shares the project checkout; worktree creates an isolated checkout.",
				),
			projectId: z
				.string()
				.uuid()
				.optional()
				.describe(
					"Project UUID. Omit to create a project-less session (managed scratch folder).",
				),
			name: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Workspace name. Required on a host; a cloud workspace without one is named from its agent's prompt.",
				),
			environment: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Cloud only: id of the environment the workspace starts from. Required when several environments have repositories.",
				),
			machineSize: z
				.enum(MACHINE_SIZES)
				.optional()
				.describe(
					"Cloud only: size of the machine. `small` (2 vCPU, 4 GB) for light work such as triage, review or answering questions; `medium` (4 vCPU, 8 GB) for most coding work; `large` (8 vCPU, 16 GB) for big builds, large test suites or heavy compiles. `xlarge` and `2xlarge` only where the organization's plan includes them. Omit it to use the environment's size, else the organization's default.",
				),
			branch: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Git branch the workspace tracks. Omit for a local checkout.",
				),
			pr: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Pull request number in `repository` (default: the project's primary repository) — the host checks out the verified PR head and derives the branch.",
				),
			baseBranch: z
				.string()
				.optional()
				.describe(
					"Branch of `repository` (default: the project's primary repository) to fork from when `branch` does not exist (defaults to that repository's default branch). Ignored when `pr` is set.",
				),
			repository: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Repository of the project that `pr` and `baseBranch` apply to, by id or folder name (see projects_list). Defaults to the project's primary repository.",
				),
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Host machineId to create the workspace on. Omit for a cloud workspace (accounts with cloud workspaces only).",
				),
			taskId: z
				.string()
				.uuid()
				.optional()
				.describe("Optional Paradev task id to link to the new workspace."),
			agents: z
				.array(agentLaunchSchema)
				.optional()
				.describe(
					"Agents to spawn in the workspace immediately after creation.",
				),
			command: z
				.string()
				.min(1)
				.optional()
				.describe("Shell command to run in the new worktree after creation."),
		},
		handler: async (input, ctx) => {
			if (!input.hostId) {
				await requireCloudUnlessHost(input, ctx);
				return createInCloud(input, ctx);
			}
			const hostId = input.hostId;
			for (const field of ["environment", "machineSize"] as const) {
				if (input[field] !== undefined) {
					throw new Error(
						`\`${field}\` applies to cloud workspaces; omit hostId to create one`,
					);
				}
			}
			if (input.name === undefined) {
				throw new Error("`name` is required for a workspace on a host");
			}
			const name = input.name;
			if (input.checkout === "local") {
				for (const field of [
					"branch",
					"pr",
					"baseBranch",
					"repository",
				] as const) {
					if (input[field] !== undefined)
						throw new Error(`${field} cannot be combined with checkout local`);
				}
			}
			if (input.projectId === undefined) {
				for (const [field, value] of [
					["checkout", input.checkout],
					["branch", input.branch],
					["pr", input.pr],
					["baseBranch", input.baseBranch],
					["repository", input.repository],
					["taskId", input.taskId],
				] as const) {
					if (value !== undefined) {
						throw new Error(
							`\`${field}\` requires \`projectId\` — sessions are project-less scratch folders with no git branch semantics`,
						);
					}
				}
				return hostServiceCall<{
					workspace: {
						id: string;
						projectId: string | null;
						name: string;
						branch: string;
					};
					terminals: Array<{ terminalId: string; label?: string }>;
					agents: Array<
						| { ok: true; kind: "terminal"; sessionId: string; label: string }
						| { ok: false; error: string }
					>;
				}>(
					{
						relayUrl: ctx.relayUrl,
						organizationId: ctx.organizationId,
						hostId,
						jwt: ctx.bearerToken,
					},
					"workspaces.createSession",
					"mutation",
					{
						name,
						agents: input.agents,
						command: input.command,
					},
				);
			}
			if (input.branch !== undefined && input.pr !== undefined) {
				throw new Error("`branch` and `pr` cannot both be set");
			}
			const target = {
				relayUrl: ctx.relayUrl,
				organizationId: ctx.organizationId,
				hostId,
				jwt: ctx.bearerToken,
			};
			const projectId = input.projectId;
			const checkouts =
				input.checkout === "local"
					? undefined
					: await checkoutsFor(
							input,
							(): Promise<HostProject | null> =>
								hostServiceCall(target, "project.get", "query", { projectId }),
						);
			return hostServiceCall<{
				workspace: {
					id: string;
					projectId: string;
					name: string;
					branch: string;
				};
				terminals: Array<{ terminalId: string; label?: string }>;
				agents: Array<
					| { ok: true; kind: "terminal"; sessionId: string; label: string }
					| { ok: false; error: string }
				>;
				alreadyExists: boolean;
			}>(
				target,
				input.checkout === "local"
					? "workspaces.createLocal"
					: "workspaces.create",
				"mutation",
				{
					projectId: input.projectId,
					checkout: input.checkout,
					name,
					branch: input.branch,
					checkouts,
					// Released hosts read only these; current hosts strip them.
					pr: input.pr,
					baseBranch: input.baseBranch || undefined,
					taskId: input.taskId,
					agents: input.agents,
					command: input.command,
				},
			);
		},
	});
}

type HostProject = {
	primaryRepositoryId?: string | null;
	repositories?: Array<{ id: string; name: string }>;
};

/**
 * The host's per-repository request for `pr` and `baseBranch`. A host
 * without `repositories` predates them and reads the top-level fields.
 */
export async function checkoutsFor(
	input: { pr?: number; baseBranch?: string; repository?: string },
	getProject: () => Promise<HostProject | null>,
): Promise<Record<string, { pr?: number; baseBranch?: string }> | undefined> {
	const baseBranch = input.baseBranch || undefined;
	if (input.pr === undefined && baseBranch === undefined) {
		if (input.repository !== undefined) {
			throw new Error("`repository` applies only with `pr` or `baseBranch`");
		}
		return undefined;
	}
	const project = await getProject();
	if (!project) throw new Error("This project is not set up on that host");
	if (!project.repositories) {
		if (input.repository !== undefined) {
			throw new Error(
				"This host is too old to pick a repository; update it, or omit `repository`",
			);
		}
		return undefined;
	}
	const wanted = input.repository ?? project.primaryRepositoryId;
	const repository = project.repositories.find(
		(candidate) =>
			candidate.id === wanted ||
			candidate.name.toLowerCase() === wanted?.toLowerCase(),
	);
	if (!repository) {
		throw new Error(
			`No repository ${wanted ?? "(primary)"} in this project. Repositories: ${project.repositories.map((candidate) => candidate.name).join(", ")}`,
		);
	}
	return {
		[repository.id]: {
			...(input.pr !== undefined ? { pr: input.pr } : {}),
			...(baseBranch !== undefined ? { baseBranch } : {}),
		},
	};
}

async function createInCloud(
	input: {
		name?: string;
		branch?: string;
		environment?: string;
		machineSize?: MachineSize;
		projectId?: string;
		checkout?: string;
		pr?: number;
		baseBranch?: string;
		repository?: string;
		taskId?: string;
		command?: string;
		agents?: Array<z.infer<typeof agentLaunchSchema>>;
	},
	ctx: McpContext,
) {
	for (const [field, value] of [
		["projectId", input.projectId],
		["checkout", input.checkout],
		["pr", input.pr],
		["baseBranch", input.baseBranch],
		["repository", input.repository],
		["taskId", input.taskId],
		["command", input.command],
	] as const) {
		if (value !== undefined) {
			throw new Error(
				`\`${field}\` applies to a workspace on a host; pass hostId, or drop it for a cloud workspace`,
			);
		}
	}
	const [launch, ...extra] = input.agents ?? [];
	if (extra.length > 0 || launch?.attachmentIds?.length) {
		throw new Error(
			"A cloud workspace launches at most one agent, without attachments",
		);
	}

	const caller = createMcpCaller(ctx);
	const environments = await caller.environment.list({
		organizationId: ctx.organizationId,
	});
	const startable = startableCloudEnvironments(environments);
	const environment = selectCloudEnvironment(environments, input.environment);
	if (!environment || !startable.includes(environment)) {
		throw new Error(
			startable.length === 0
				? "No environment with repositories in this organization. Create one in Settings → Environments."
				: `${environment ? `Environment "${environment.name}" has no repositories` : input.environment === undefined ? "Several environments have repositories; pass environment" : `No environment ${input.environment}`}. Start from one of: ${describeEnvironments(startable)}`,
		);
	}

	return caller.cloudWorkspace.create({
		organizationId: ctx.organizationId,
		environmentId: environment.id,
		...(input.name ? { name: input.name } : {}),
		...(input.branch ? { branch: input.branch } : {}),
		...(input.machineSize ? { machineSize: input.machineSize } : {}),
		...(launch
			? {
					agent: launch.agent,
					prompt: launch.prompt,
					...(launch.model ? { model: launch.model } : {}),
					...(launch.effort ? { effort: launch.effort } : {}),
				}
			: {}),
	});
}
