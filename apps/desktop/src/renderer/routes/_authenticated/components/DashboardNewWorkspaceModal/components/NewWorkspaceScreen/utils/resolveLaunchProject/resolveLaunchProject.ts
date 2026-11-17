import type { WorkspaceCreateProjectChoice } from "renderer/stores/v2-workspace-create-defaults";

export interface LaunchProject {
	id: string;
	repository: string | null;
}

export type LaunchProjectPick =
	| { kind: "project"; projectId: string; repository?: string | null }
	| { kind: "session" }
	| { kind: "none" };

export interface ResolvedLaunchProject {
	projectId: string | null;
	isSession: boolean;
	isPending: boolean;
}

export function toLaunchProject(project: {
	id: string;
	githubOwner?: string | null;
	githubRepoName?: string | null;
}): LaunchProject {
	return {
		id: project.id,
		repository:
			project.githubOwner && project.githubRepoName
				? `${project.githubOwner}/${project.githubRepoName}`
				: null,
	};
}

const SESSION: ResolvedLaunchProject = {
	projectId: null,
	isSession: true,
	isPending: false,
};

function project(projectId: string): ResolvedLaunchProject {
	return { projectId, isSession: false, isPending: false };
}

/**
 * The pick follows its repository across hosts, then the host's own last
 * choice. A pick no list knows yet, and with no repository to say where it
 * lives, is held: it is usually a project the host just added.
 */
export function resolveLaunchProject({
	pick,
	projects,
	knownProjects,
	isReady,
	lastChoice,
}: {
	pick: LaunchProjectPick;
	projects: readonly LaunchProject[];
	knownProjects: readonly LaunchProject[];
	isReady: boolean;
	lastChoice: WorkspaceCreateProjectChoice | null;
}): ResolvedLaunchProject {
	if (pick.kind === "session") return SESSION;

	if (pick.kind === "project") {
		if (projects.some((candidate) => candidate.id === pick.projectId)) {
			return project(pick.projectId);
		}
		const repository =
			pick.repository ??
			knownProjects.find((candidate) => candidate.id === pick.projectId)
				?.repository;
		const sameRepository =
			repository &&
			projects.find(
				(candidate) =>
					candidate.repository?.toLowerCase() === repository.toLowerCase(),
			);
		if (sameRepository) return project(sameRepository.id);
		const isKnown = knownProjects.some(
			(candidate) => candidate.id === pick.projectId,
		);
		if (!isReady || (!isKnown && !repository)) {
			return { projectId: pick.projectId, isSession: false, isPending: true };
		}
	}

	if (lastChoice?.kind === "none") return SESSION;
	if (
		lastChoice?.kind === "project" &&
		projects.some((candidate) => candidate.id === lastChoice.projectId)
	) {
		return project(lastChoice.projectId);
	}
	if (isReady && projects.length === 1) return project(projects[0].id);
	return { projectId: null, isSession: false, isPending: !isReady };
}
