import type { SelectEnvironmentBuild } from "@superset/db/schema";
import type { ResolvedPhase } from "@superset/shared/project-config";
import { sandboxRepositoryPath } from "@superset/shared/sandbox/contract";
import type { NetworkPolicy } from "@vercel/sandbox";
import { FatalError } from "workflow";
import { resolveEnvironment } from "../../../router/environment/resolve-environment";
import { deriveSandboxCredentials } from "../credentials";
import { readRepoHooks } from "../repo-hooks";
import {
	cloneUrl,
	environmentRepositoryRows,
	installationTokenFor,
	loadRepositories,
	RepositoryError,
} from "../repositories";
import { deleteSandbox } from "../vercel";
import {
	type BuildCheckout,
	goldensToDelete,
	removedCheckoutPaths,
} from "./policy";
import { finishedBuilds, markGoldensDeleted } from "./store";

const BUILD_AUTHOR = { name: "Superset", email: "noreply@superset.sh" };
export const BOX_READY_MS = 45_000;

export function buildBoxName(buildId: string): string {
	return `envb-${buildId.replaceAll("-", "").slice(0, 24)}`;
}

/** A fresh build has its own box name, so a fork of it still being deleted cannot collide. */
export function freshBuildBoxName(buildId: string): string {
	return `${buildBoxName(buildId)}-fresh`;
}

export function buildBoxNameFor(build: {
	id: string;
	kind: SelectEnvironmentBuild["kind"];
}): string {
	return build.kind === "fresh"
		? freshBuildBoxName(build.id)
		: buildBoxName(build.id);
}

export interface BuildInputs {
	install: ResolvedPhase | null;
	installSource: string;
	checkouts: BuildCheckout[];
	removedPaths: string[];
	networkPolicy: NetworkPolicy;
	env: Record<string, string>;
}

/** A failure with a reason a person can act on; the workflow does not retry it. */
export class BuildFailure extends FatalError {}

export async function within<T>(
	work: Promise<T>,
	timeoutMs: number,
	reason: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new BuildFailure(reason)), timeoutMs);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/** The primary repository first, each at the path a workspace has it. */
export async function prepareBuild(
	build: SelectEnvironmentBuild,
): Promise<BuildInputs> {
	try {
		return await readBuildInputs(build);
	} catch (error) {
		if (error instanceof RepositoryError) throw new BuildFailure(error.message);
		throw error;
	}
}

async function readBuildInputs(
	build: SelectEnvironmentBuild,
): Promise<BuildInputs> {
	const repositories = await loadRepositories({
		organizationId: build.organizationId,
		repositoryIds: build.repositoryIds,
	});
	const primary =
		repositories.find((row) => row.id === build.primaryRepositoryId) ??
		repositories[0];
	if (!primary) throw new BuildFailure("The environment has no repositories");
	const ordered = [
		primary,
		...repositories.filter((row) => row.id !== primary.id),
	];
	const baseBranch = primary.defaultBranch;
	const token = await installationTokenFor(ordered);
	const [hooks, environment, current] = await Promise.all([
		readRepoHooks({ repo: primary, branch: baseBranch, token }),
		resolveEnvironment(build.environmentId, build.organizationId),
		environmentRepositoryRows(build.environmentId),
	]);
	const { networkPolicy, managedEnv } = await deriveSandboxCredentials({
		workspaceId: build.id,
		environmentEnv: environment?.envs ?? {},
		userAgentEnv: {},
		githubToken: token,
		gitAuthor: BUILD_AUTHOR,
	});
	return {
		install: hooks?.install ?? null,
		installSource: `${primary.fullName}@${baseBranch}`,
		checkouts: ordered.map((repository) => ({
			url: cloneUrl(repository),
			branch:
				repository.id === primary.id ? baseBranch : repository.defaultBranch,
			path: sandboxRepositoryPath(repository, ordered),
		})),
		removedPaths:
			build.kind === "incremental"
				? removedCheckoutPaths({ current, nextIds: build.repositoryIds })
				: [],
		networkPolicy,
		env: { ...managedEnv, SUPERSET_ENV: "cloud" },
	};
}

/** Keeps the newest goldens; a golden that cannot be deleted now is tried again next time. */
export async function pruneGoldens(args: {
	environmentId: string;
	activeRef: string;
}): Promise<void> {
	const stale = goldensToDelete(
		await finishedBuilds(args.environmentId),
		args.activeRef,
	);
	const deleted: string[] = [];
	for (const build of stale) {
		if (!build.goldenRef) continue;
		try {
			await deleteSandbox(build.goldenRef);
			deleted.push(build.id);
		} catch (error) {
			console.error(
				`[environment-build] could not delete old golden ${build.goldenRef}`,
				error,
			);
		}
	}
	await markGoldensDeleted(deleted);
}
