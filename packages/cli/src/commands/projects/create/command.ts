import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	hostPath,
	requireHostTarget,
	resolveHostTarget,
} from "../../../lib/host-target";
import { repositorySource } from "../utils/repositorySource";

export default command({
	description: "Create a project of one or more repositories on a host",
	options: {
		host: string().desc("Target host machineId (required unless --local)"),
		local: boolean().desc("Target this machine (required unless --host)"),
		name: string().required().desc("Project name"),
		repo: string()
			.variadic()
			.required()
			.desc(
				"A repository: a local path on the target host, or a git URL to clone into --parent-dir. Repeatable; the first is the primary",
			),
		parentDir: string().desc(
			"Directory cloned repositories land in (required when a --repo is a URL)",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const repositories = options.repo.map(repositorySource);
		const clones = repositories.some((source) => source.kind === "clone");
		if (clones && !options.parentDir) {
			throw new CLIError(
				"Cloning a --repo URL needs --parent-dir",
				"Pass --parent-dir <path> for the clones",
			);
		}
		if (!clones && options.parentDir) {
			throw new CLIError(
				"--parent-dir is only used to clone a --repo URL",
				"Local --repo paths are used where they are",
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const result = await target.client.project.create.mutate({
			name: options.name,
			repositories: repositories.map((source) =>
				source.kind === "local"
					? { kind: "local", path: hostPath(target, source.path) }
					: source,
			),
			...(options.parentDir
				? { parentDir: hostPath(target, options.parentDir) }
				: {}),
		});

		if (!result.created) {
			return {
				data: result,
				message: `Reused project "${result.name}" (${result.id}): host ${target.hostId} already has a project for that folder, so --name was not applied`,
			};
		}
		return {
			data: result,
			message: `Created project "${result.name}" with ${result.repositories.length} repositor${
				result.repositories.length === 1 ? "y" : "ies"
			} on host ${target.hostId}`,
		};
	},
});
