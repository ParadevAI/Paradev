import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import {
	findRepository,
	type HostProject,
	hostPath,
	type ResolvedHostTarget,
	requireRepositories,
	resolveHostFilter,
	resolveHostTarget,
} from "../../../lib/host-target";
import {
	findSourceProject,
	findSourceWithNewRepositories,
	HostsDisagreeError,
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

function originOf(project: HostProject) {
	return {
		name: project.name,
		primaryRepositoryId: project.primaryRepositoryId,
		repositories: requireRepositories(project).map(({ id, name, url }) => ({
			id,
			name,
			url,
		})),
	};
}

function requirePlaced(
	repositories: { id: string; name: string }[],
	placements: { id: string }[],
	addedOnHost?: string,
): void {
	const placed = new Set(placements.map(({ id }) => id));
	const unplaced = repositories.filter((r) => !placed.has(r.id));
	if (unplaced.length === 0) return;
	const names = unplaced.map((r) => r.name).join(", ");
	throw new CLIError(
		addedOnHost
			? `Pick a folder for ${names}, added to the project on host ${addedOnHost}`
			: `Pick a folder for ${names}`,
		"Pass --clone-into <dir> to clone them, or --path <repo>=<dir> for a folder that already has one",
	);
}

type SetupResult = Awaited<
	ReturnType<ResolvedHostTarget["client"]["project"]["setup"]["mutate"]>
>;

/** Brings back a project this host deleted, for a host whose project.get cannot list deleted projects; null when the host never had it. */
async function restoreDeleted(
	target: ResolvedHostTarget,
	projectId: string,
): Promise<SetupResult | null> {
	try {
		return await target.client.project.setup.mutate({
			projectId,
			repositories: [],
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("not_set_up:")) {
			return null;
		}
		throw error;
	}
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
			"Move a repository this host already has to its --path folder, even if its current folder still works. Refused while workspaces use worktrees of a repository it would move",
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
		const relocate = options.allowRelocate ? { allowRelocate: true } : {};

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
		const placementsFor = (project: HostProject) => {
			const placements = new Map<string, PlacementMode>();
			for (const { ref, dir } of paths) {
				const repository = findRepository(project, ref);
				if (placements.has(repository.id)) {
					throw new CLIError(`--path names ${repository.name} twice`);
				}
				placements.set(repository.id, {
					kind: "import",
					path: hostPath(target, dir),
					...relocate,
				});
			}
			if (options.cloneInto) {
				const parentDir = hostPath(target, options.cloneInto);
				for (const repository of requireRepositories(project)) {
					if (!placements.has(repository.id)) {
						placements.set(repository.id, { kind: "clone", parentDir });
					}
				}
			}
			return [...placements].map(([id, mode]) => ({ id, mode }));
		};
		const sourceArgs = {
			api: ctx.api,
			userJwt: ctx.bearer,
			organizationId,
			projectId,
			targetHostId: target.hostId,
			fromHostId: options.fromHost ?? undefined,
		};

		const found = await target.client.project.get.query({
			projectId,
			includeDeleted: true,
		});
		const existing = found?.deleted ? null : found;
		const restoredProject = found
			? null
			: await restoreDeleted(target, projectId);
		let source: SourceProject | null = null;
		let added: HostProject["repositories"] = [];
		let result: SetupResult;
		if (found || restoredProject) {
			const known = (found ?? restoredProject) as HostProject;
			const knownRepositories = requireRepositories(known);
			source = await findSourceWithNewRepositories({
				...sourceArgs,
				known,
			}).catch((error: unknown) => {
				if (sourceArgs.fromHostId || error instanceof HostsDisagreeError)
					throw error;
				const reason = error instanceof Error ? error.message : String(error);
				process.stderr.write(
					`Could not ask other hosts for repositories added there: ${reason}\n`,
				);
				return null;
			});
			const knownIds = new Set(knownRepositories.map((r) => r.id));
			added = source
				? requireRepositories(source.project).filter((r) => !knownIds.has(r.id))
				: [];
			const placements = placementsFor({
				...known,
				repositories: [...knownRepositories, ...added],
			});
			if (source) requirePlaced(added, placements, source.hostId);
			result =
				!source && restoredProject && placements.length === 0
					? restoredProject
					: await target.client.project.setup.mutate({
							projectId,
							...(source ? { origin: originOf(source.project) } : {}),
							repositories: placements,
						});
		} else {
			source = await findSourceProject(sourceArgs);
			const placements = placementsFor(source.project);
			requirePlaced(requireRepositories(source.project), placements);
			result = await target.client.project.setup.mutate({
				projectId,
				origin: originOf(source.project),
				repositories: placements,
			});
		}

		const before = new Map(
			(existing?.repositories ?? []).map((r) => [r.id, r.path]),
		);
		const restored = !existing && !result.created;
		const addedIds = new Set(added.map((r) => r.id));
		const lines = result.repositories.map((repository) => {
			const state =
				!result.created && addedIds.has(repository.id)
					? `added from host ${source?.hostId}`
					: placementState({
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
