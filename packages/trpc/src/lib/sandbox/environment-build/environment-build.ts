import type { SelectEnvironmentBuild } from "@superset/db/schema";
import type { ResolvedPhase } from "@superset/shared/project-config";
import { sandboxRepositoryPath } from "@superset/shared/sandbox/contract";
import type { NetworkPolicy } from "@vercel/sandbox";
import { FatalError } from "workflow";
import { resolveEnvironment } from "../../../router/environment/resolve-environment";
import { deriveSandboxCredentials } from "../credentials";
import { environmentHooks } from "../repo-hooks";
import {
	cloneUrl,
	installationTokenFor,
	loadRepositories,
	RepositoryError,
} from "../repositories";
import type { BuildCheckout } from "./policy";

const BUILD_AUTHOR = { name: "Paradev", email: "noreply@superset.sh" };
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
	const token = (await installationTokenFor(ordered))?.token ?? null;
	const environment = await resolveEnvironment(
		build.environmentId,
		build.organizationId,
	);
	const config = environment?.config ?? null;
	const hooks = await environmentHooks({
		config,
		repo: primary,
		branch: baseBranch,
		token,
	});
	const { networkPolicy, managedEnv } = await deriveSandboxCredentials({
		workspaceId: build.id,
		environmentEnv: environment?.envs ?? {},
		userAgentEnv: {},
		githubToken: token,
		gitAuthor: BUILD_AUTHOR,
	});
	return {
		install: hooks?.install ?? null,
		installSource: config?.trim()
			? "the environment's config"
			: `.paradev/config.toml on ${primary.fullName}@${baseBranch}`,
		checkouts: ordered.map((repository) => ({
			url: cloneUrl(repository),
			branch: repository.defaultBranch,
			path: sandboxRepositoryPath(repository, ordered),
		})),
		networkPolicy,
		env: { ...managedEnv, SUPERSET_ENV: "cloud" },
	};
}
