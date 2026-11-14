import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import {
	findRepository,
	hostPath,
	requireRepositories,
	resolveHostFilter,
	resolveHostTarget,
} from "../../../lib/host-target";
import {
	findSourceProject,
	type SourceProject,
} from "./utils/findSourceProject";

type PlacementMode =
	| { kind: "clone"; parentDir: string }
	| { kind: "import"; path: string; allowRelocate?: boolean };

function parsePathOption(value: string): { ref: string; dir: string } {
	const separator = value.indexOf("=");
	const ref = value.slice(0, separator).trim();
	const dir = value.slice(separator + 1).trim();
	if (separator < 0 || !ref || !dir) {
		throw new CLIError(
			`--path ${value} is not <repo>=<dir>`,
			"Name the repository and its folder, e.g. --path api=~/code/api",
		);
	}
	return { ref, dir };
}

function placementState({
	created,
	restored,
	previousPath,
	path,
}: {
	created: boolean;
	restored: boolean;
	previousPath: string | undefined;
	path: string;
}): string {
	if (created || (!restored && previousPath === undefined)) return "set up";
	if (restored) return "restored";
	return previousPath === path ? "already there" : "moved";
}

export default command({
	description: "Set up a project from another host of the organization",
	args: [positional("id").desc("Project ID")],
	options: {
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
		fromHost: string().desc(
			"Host machineId to copy the project from (default: the only other host that has it)",
		),
		cloneInto: string().desc("Directory to clone every repository into"),
		path: string()
			.variadic()
			.desc(
				"<repo>=<dir>: use the existing folder <dir> for the repository named <repo> (name or ID). Repeatable; wins over --clone-into",
			),
		allowRelocate: boolean().desc(
			"Move a repository this host already has to its --path folder",
		),
	},
	run: async ({ ctx, args, options }) => {
		const projectId = args.id as string | undefined;
		if (!projectId) {
			throw new CLIError(
				"Pass the project ID",
				"Find it with: superset projects list --host <id>",
			);
		}
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const paths = (options.path ?? []).map(parsePathOption);
		if (options.allowRelocate && paths.length === 0) {
			throw new CLIError(
				"--allow-relocate only applies to --path",
				"Add --path <repo>=<dir>, or drop --allow-relocate",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId:
				resolveHostFilter({
					host: options.host ?? undefined,
					local: options.local ?? undefined,
				}) ?? getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const existing = await target.client.project.get.query({ projectId });
		let project = existing;
		let source: SourceProject | null = null;
		if (!project) {
			source = await findSourceProject({
				api: ctx.api,
				userJwt: ctx.bearer,
				organizationId,
				projectId,
				targetHostId: target.hostId,
				fromHostId: options.fromHost ?? undefined,
			});
			project = source.project;
		}
		const repositories = requireRepositories(project);

		const placements = new Map<string, PlacementMode>();
		for (const { ref, dir } of paths) {
			const repository = findRepository(project, ref);
			if (placements.has(repository.id)) {
				throw new CLIError(`--path names ${repository.name} twice`);
			}
			placements.set(repository.id, {
				kind: "import",
				path: hostPath(target, dir),
				...(options.allowRelocate ? { allowRelocate: true } : {}),
			});
		}
		if (options.cloneInto) {
			const parentDir = hostPath(target, options.cloneInto);
			for (const repository of repositories) {
				if (!placements.has(repository.id)) {
					placements.set(repository.id, { kind: "clone", parentDir });
				}
			}
		}
		const unplaced = repositories.filter((r) => !placements.has(r.id));
		if (!existing && unplaced.length > 0) {
			throw new CLIError(
				`Pick a folder for ${unplaced.map((r) => r.name).join(", ")}`,
				"Pass --clone-into <dir> to clone them, or --path <repo>=<dir> for a folder that already has one",
			);
		}

		const result = await target.client.project.setup.mutate({
			projectId,
			...(source
				? {
						origin: {
							name: project.name,
							primaryRepositoryId: project.primaryRepositoryId,
							repositories: repositories.map(({ id, name, url }) => ({
								id,
								name,
								url,
							})),
						},
					}
				: {}),
			repositories: [...placements].map(([id, mode]) => ({ id, mode })),
		});

		const before = new Map(
			(existing?.repositories ?? []).map((r) => [r.id, r.path]),
		);
		const restored = !existing && !result.created;
		const lines = result.repositories.map((repository) => {
			const state = placementState({
				created: result.created,
				restored,
				previousPath: before.get(repository.id),
				path: repository.path,
			});
			return `  ${repository.name}  ${repository.path}  (${state})`;
		});
		const heading = result.created
			? `Set up project "${result.name}" on host ${target.hostId} from host ${source?.hostId}`
			: restored
				? `Restored project "${result.name}" on host ${target.hostId}`
				: `Project "${result.name}" is already on host ${target.hostId}`;
		return { data: result, message: [heading, ...lines].join("\n") };
	},
});
