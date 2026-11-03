import { CLIError } from "@superset/cli-framework";
import type { MachineSize } from "@superset/shared/billing";
import { TRPCClientError } from "@trpc/client";
import type { ApiClient } from "../../../lib/api-client";
import { resolveCloudEnvironment } from "../../../lib/cloud-workspaces";
import { workspaceLinks } from "../../../lib/open-url";

/** What `ws create` parsed; the host-only flags are here only to be refused. */
export interface CloudCreateOptions {
	name?: string;
	checkout?: string;
	branch?: string;
	agent?: string;
	prompt?: string;
	model?: string;
	effort?: string;
	environment?: string;
	machineSize?: MachineSize;
	project?: string;
	session?: boolean;
	pr?: number;
	task?: string;
	baseBranch?: string;
	skipBranchPrefix?: boolean;
	tag?: string[];
	attachment?: string[];
	command?: string;
}

/**
 * Create a cloud sandbox. Provisioning is a background job, so this returns
 * with the row still in `provisioning` — `ws list --cloud` watches it.
 */
export async function createCloudWorkspace(args: {
	api: ApiClient;
	organizationId: string;
	options: CloudCreateOptions;
}): Promise<{ data: unknown; message: string }> {
	const { api, organizationId, options } = args;

	// A cloud workspace's checkout is its environment's: no project, worktree
	// or host. Those flags mean the caller wanted a host, so say how.
	for (const [flag, value] of [
		["--checkout", options.checkout],
		["--project", options.project],
		["--session", options.session || undefined],
		["--pr", options.pr],
		["--task", options.task],
		["--skip-branch-prefix", options.skipBranchPrefix || undefined],
		["--tag", options.tag?.length ? options.tag : undefined],
		[
			"--attachment",
			options.attachment?.length ? options.attachment : undefined,
		],
		["--command", options.command],
	] as const) {
		if (value !== undefined) {
			throw new CLIError(
				`${flag} does not apply to a cloud workspace`,
				"Your account creates workspaces in the cloud by default. Pass --local to create on this machine, or --host <id> for another host",
			);
		}
	}

	if (options.branch !== undefined) {
		throw new CLIError(
			"--branch does not apply to a cloud workspace",
			"A cloud workspace always works on a new branch of its own. Pass --base-branch <name> to pick the branch it starts from",
		);
	}

	// Same pairing rules as the host path.
	for (const [flag, value] of [
		["--prompt", options.prompt],
		["--model", options.model],
		["--effort", options.effort],
	] as const) {
		if (value !== undefined && !options.agent) {
			throw new CLIError(
				`${flag} requires --agent`,
				"Pass --agent <id> alongside it, or drop the flag for a sandbox that comes up idle",
			);
		}
	}
	if (options.agent && !options.prompt) {
		throw new CLIError(
			"--agent requires --prompt",
			"Pass --prompt <text> alongside --agent",
		);
	}

	const environments = await api.environment.list
		.query({ organizationId })
		.catch(rethrowWithLocationHint);
	const environment = resolveCloudEnvironment(
		environments,
		options.environment,
	);

	const row = await api.cloudWorkspace.create
		.mutate({
			organizationId,
			environmentId: environment.id,
			...(options.name ? { name: options.name } : {}),
			...(options.baseBranch ? { branch: options.baseBranch } : {}),
			...(options.agent ? { agent: options.agent } : {}),
			...(options.prompt ? { prompt: options.prompt } : {}),
			...(options.model ? { model: options.model } : {}),
			...(options.effort ? { effort: options.effort } : {}),
			...(options.machineSize ? { machineSize: options.machineSize } : {}),
		})
		.catch(rethrowWithLocationHint);

	const links = workspaceLinks(row.id);
	return {
		data: { ...row, ...links },
		message: `Provisioning cloud workspace ${row.id} on branch ${row.branch} (environment: ${environment.name})\n${links.webUrl}`,
	};
}

/** Without cloud access the default location is refused; point at the others. */
function rethrowWithLocationHint(error: unknown): never {
	if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
		throw new CLIError(
			error.message,
			"Pass --local to create on this machine, or --host <id> for another host",
		);
	}
	throw error;
}
