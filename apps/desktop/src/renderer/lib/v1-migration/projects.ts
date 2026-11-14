import type { HostServiceClient } from "renderer/lib/host-service-client";
import { legacySetupInput } from "renderer/lib/legacySetupInput";
import { getBaseName } from "renderer/lib/pathBasename";

export interface V1ProjectLike {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
	/** v1 accent color: a `#rrggbb` hex or the "default" sentinel. */
	color?: string | null;
	/** v1 "hide the GitHub avatar" flag — carries as the "none" icon. */
	hideImage?: boolean | null;
}

export type ProjectFindByPathResult = Awaited<
	ReturnType<HostServiceClient["project"]["findByPath"]["query"]>
>;

export type ProjectImportOutcome =
	| {
			kind: "imported";
			v2ProjectId: string;
			repoPath: string;
	  }
	| { kind: "needs-relocate"; v2ProjectId: string; message: string };

export type UnmigratableRepoReason = "repo-path-missing" | "not-a-git-repo";

export type ProjectImportDecision =
	| { kind: "already-imported"; v2ProjectId: string }
	| { kind: "import" }
	| {
			kind: "skip";
			reason: "multiple-candidates" | "cloud-unreachable" | "not-a-git-repo";
	  };

/**
 * Decide what to do with a v1 project from its findByPath result. Mirrors
 * the wizard's "Import all" rules: a `local-path` candidate means the repo
 * is already a v2 project on this host; multiple cloud candidates need a
 * human to pick; cloud errors with no candidate mean we can't tell whether
 * a legacy cloud project exists, so don't risk creating a duplicate. A
 * folder that is no longer a git repo has nothing to import headlessly.
 */
export function decideProjectImport(
	result: Pick<ProjectFindByPathResult, "candidates" | "cloudErrors"> & {
		needsGitInit?: boolean;
	},
): ProjectImportDecision {
	const local = result.candidates.find((c) => c.source === "local-path");
	if (local) return { kind: "already-imported", v2ProjectId: local.id };
	if (result.needsGitInit) return { kind: "skip", reason: "not-a-git-repo" };
	if (result.candidates.length > 1) {
		return { kind: "skip", reason: "multiple-candidates" };
	}
	if (result.candidates.length === 0 && result.cloudErrors.length > 0) {
		return { kind: "skip", reason: "cloud-unreachable" };
	}
	return { kind: "import" };
}

export function isProjectAlreadyImported(
	findByPathResult: ProjectFindByPathResult | undefined,
): boolean {
	return !!findByPathResult?.candidates.find((c) => c.source === "local-path");
}

export function expectedRemoteUrlFor(
	project: Pick<V1ProjectLike, "mainRepoPath" | "githubOwner">,
): string | undefined {
	if (!project.githubOwner) return undefined;
	const repoName = getBaseName(project.mainRepoPath);
	if (!repoName) return undefined;
	return `https://github.com/${project.githubOwner}/${repoName}`;
}

export function findProjectByPath(
	hostClient: HostServiceClient,
	project: V1ProjectLike,
): Promise<ProjectFindByPathResult> {
	return hostClient.project.findByPath.query({
		repoPath: project.mainRepoPath,
		walkAllRemotes: true,
		expectedRemoteUrl: expectedRemoteUrlFor(project),
	});
}

/**
 * Host errors that mean the v1 project has nothing left to migrate on this
 * machine: its repo moved, was deleted, or stopped being a git checkout.
 * Message shapes are the host-service's (resolve-repo.ts, local-project.ts).
 */
export function classifyUnmigratableRepoError(
	err: unknown,
): UnmigratableRepoReason | null {
	const message =
		err instanceof Error ? err.message : typeof err === "string" ? err : "";
	if (
		message.startsWith("Path does not exist: ") ||
		message.startsWith("Path is not a directory: ") ||
		message === "Project directory is no longer a directory on disk"
	) {
		return "repo-path-missing";
	}
	if (message.startsWith("Not a git repository: ")) return "not-a-git-repo";
	return null;
}

export function isAlreadySetUpElsewhereError(err: unknown): boolean {
	return err instanceof Error && err.message.includes("already_set_up:");
}

export function extractExistingPath(message: string): string | null {
	return message.match(/is already at (.+?) on this host;/)?.[1] ?? null;
}

/**
 * Import one v1 project into v2. A `local-path` candidate is the v2 project
 * the repo already belongs to on this host; a legacy cloud (`remote`)
 * candidate is set up on this host with the repo as its one repository;
 * otherwise a fresh local-first project of one repository is made via
 * `project.create`. Pure host-service calls — UI side effects (sidebar,
 * query invalidation) are the caller's job.
 */
export async function importV1Project({
	hostClient,
	project,
	findByPathResult,
	linkToProjectId,
	allowRelocate = false,
}: {
	hostClient: HostServiceClient;
	project: V1ProjectLike;
	findByPathResult: ProjectFindByPathResult | undefined;
	linkToProjectId?: string;
	allowRelocate?: boolean;
}): Promise<ProjectImportOutcome> {
	const candidates = findByPathResult?.candidates ?? [];

	const targetCandidate = linkToProjectId
		? candidates.find((c) => c.id === linkToProjectId)
		: candidates[0];

	if (linkToProjectId && !targetCandidate) {
		throw new Error(
			"Selected v2 project is no longer in the candidate list. Refresh and pick again.",
		);
	}

	if (targetCandidate?.source === "local-path") {
		await carryV1ProjectAppearance(hostClient, targetCandidate.id, project);
		return {
			kind: "imported",
			v2ProjectId: targetCandidate.id,
			repoPath: project.mainRepoPath,
		};
	}

	let result: Awaited<ReturnType<typeof hostClient.project.create.mutate>>;
	if (targetCandidate) {
		try {
			result = await hostClient.project.setup.mutate(
				legacySetupInput({
					candidate: targetCandidate,
					path: project.mainRepoPath,
					allowRelocate,
				}),
			);
		} catch (err) {
			if (isAlreadySetUpElsewhereError(err) && !allowRelocate) {
				return {
					kind: "needs-relocate",
					v2ProjectId: targetCandidate.id,
					message: err instanceof Error ? err.message : String(err),
				};
			}
			throw err;
		}
	} else {
		result = await hostClient.project.create.mutate({
			name: project.name,
			repositories: [{ kind: "local", path: project.mainRepoPath }],
		});
	}
	// A project `project.create` reused may carry v2 customizations the user
	// chose after their first import; never overwrite those.
	if (targetCandidate || result.created) {
		await carryV1ProjectAppearance(hostClient, result.id, project);
	}
	return {
		kind: "imported",
		v2ProjectId: result.id,
		repoPath:
			result.repositories.find((r) => r.id === result.primaryRepositoryId)
				?.path ?? project.mainRepoPath,
	};
}

/**
 * Best-effort: copy v1 appearance onto the imported v2 project — the accent
 * color (v1 stores either a hex or the "default" sentinel; only real hexes
 * carry over) and the hide-avatar flag (v2's "none" icon sentinel). Never
 * fails the import (appearance is cosmetic, and older hosts lack setColor).
 */
async function carryV1ProjectAppearance(
	hostClient: HostServiceClient,
	v2ProjectId: string,
	project: Pick<V1ProjectLike, "color" | "hideImage">,
): Promise<void> {
	const { color } = project;
	if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
		try {
			await hostClient.project.setColor.mutate({
				projectId: v2ProjectId,
				color,
			});
		} catch (err) {
			console.error("[v1-migration] carrying project color failed", {
				v2ProjectId,
				err,
			});
		}
	}
	if (project.hideImage) {
		try {
			await hostClient.project.setIcon.mutate({
				projectId: v2ProjectId,
				icon: "none",
			});
		} catch (err) {
			console.error("[v1-migration] carrying hide-image flag failed", {
				v2ProjectId,
				err,
			});
		}
	}
}
