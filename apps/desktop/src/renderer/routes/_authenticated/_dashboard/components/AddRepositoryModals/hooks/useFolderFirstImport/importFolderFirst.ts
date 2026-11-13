import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { getPrimaryRepository } from "renderer/hooks/host-projects/useHostProjects";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import type { ProjectSetupResult } from "renderer/react-query/projects";

export interface MatchingProject {
	id: string;
	name: string;
	/** Set on a local match: the repository at the folder. */
	repositoryId?: string;
}

export interface FolderImportResult extends ProjectSetupResult {
	/** The repository the folder became, or already was. */
	repositoryId: string;
}

export type FolderImportClient = {
	project: Pick<HostServiceClient["project"], "findByPath" | "create">;
};

export interface ImportFolderFirstDeps {
	pickDirectory: () => Promise<{ canceled: boolean; path?: string | null }>;
	waitForHostReady: () => Promise<string | null>;
	getClient: (hostUrl: string) => FolderImportClient;
	requestGitInit: (repoPath: string) => Promise<boolean>;
	finalizeSetup: (hostUrl: string, result: FolderImportResult) => void;
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
	messages: {
		hostUnavailable: () => string;
		cloudUnreachable: (first: { url: string; message: string }) => string;
		multipleProjects: (candidates: MatchingProject[]) => string;
	};
}

export async function importFolderFirst({
	pickDirectory,
	waitForHostReady,
	getClient,
	requestGitInit,
	finalizeSetup,
	onError,
	onMultipleProjects,
	messages,
}: ImportFolderFirstDeps): Promise<FolderImportResult | null> {
	// Pick the folder first — the native dialog is a local Electron call and
	// must not wait on the host service. Only the registration below needs it.
	let repoPath: string;
	try {
		const picked = await pickDirectory();
		if (picked.canceled || !picked.path) return null;
		repoPath = picked.path;
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}

	const activeHostUrl = await waitForHostReady();
	if (!activeHostUrl) {
		onError?.(messages.hostUnavailable());
		return null;
	}

	const client = getClient(activeHostUrl);
	let candidates: MatchingProject[];
	try {
		const response = await client.project.findByPath.query({ repoPath });

		// Folder isn't a git repo yet: offer to `git init` it, then import
		// via the create path with init enabled.
		if ("needsGitInit" in response && response.needsGitInit) {
			const confirmed = await requestGitInit(repoPath);
			if (!confirmed) return null;
			const result = await createLocalProject(client, repoPath, true);
			finalizeSetup(activeHostUrl, result);
			return result;
		}

		candidates = response.candidates;
		if (candidates.length === 0 && response.cloudErrors.length > 0) {
			onError?.(messages.cloudUnreachable(response.cloudErrors[0]));
			return null;
		}
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}

	const [only, ...rest] = candidates;
	if (rest.length > 0) {
		if (onMultipleProjects) {
			onMultipleProjects({ candidates });
		} else {
			onError?.(messages.multipleProjects(candidates));
		}
		return null;
	}

	try {
		// A local match is the project this folder already belongs to.
		const result: FolderImportResult = only?.repositoryId
			? { projectId: only.id, repositoryId: only.repositoryId, repoPath }
			: await createLocalProject(client, repoPath, false);
		finalizeSetup(activeHostUrl, result);
		return result;
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}
}

async function createLocalProject(
	client: FolderImportClient,
	repoPath: string,
	initIfNeeded: boolean,
): Promise<FolderImportResult> {
	const project = await client.project.create.mutate({
		name: getBaseName(repoPath),
		repositories: [
			{
				kind: "local",
				path: repoPath,
				...(initIfNeeded ? { initIfNeeded } : {}),
			},
		],
	});
	const repository = getPrimaryRepository(project);
	if (!repository)
		throw new Error(
			i18n._(msg({ message: "The host created a project with no repository" })),
		);
	return {
		projectId: project.id,
		repositoryId: repository.id,
		repoPath: repository.path,
	};
}
