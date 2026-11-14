import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	type FolderImportClient,
	type ImportFolderFirstDeps,
	importFolderFirst,
	type MatchingProject,
} from "./importFolderFirst";

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};

const findByPathMock = mock(
	async (): Promise<{
		candidates: MatchingProject[];
		cloudErrors: (typeof cloudError)[];
		needsGitInit?: boolean;
	}> => ({
		candidates: [],
		cloudErrors: [],
	}),
);
const createMock = mock(async () => ({
	id: "created-project",
	primaryRepositoryId: "repository",
	repositories: [{ id: "repository", path: repoPath }],
	created: true,
}));
const setupMock = mock(async (input: { projectId: string }) => ({
	id: input.projectId,
	created: true,
}));
const finalizeSetupMock = mock(() => undefined);
const requestGitInitMock = mock(async () => false);
const clientUrls: string[] = [];

function startImport(overrides: Partial<ImportFolderFirstDeps> = {}) {
	return importFolderFirst({
		pickDirectory: async () => ({ canceled: false, path: repoPath }),
		waitForHostReady: async () => hostUrl,
		getClient: (url) => {
			clientUrls.push(url);
			return {
				project: {
					findByPath: { query: findByPathMock },
					create: { mutate: createMock },
					setup: { mutate: setupMock },
				},
			} as unknown as FolderImportClient;
		},
		requestGitInit: requestGitInitMock,
		finalizeSetup: finalizeSetupMock,
		messages: {
			hostUnavailable: () => "host unavailable",
			cloudUnreachable: (first) =>
				`Couldn't reach cloud for ${first.url}: ${first.message}`,
			multipleProjects: (candidates) => `multiple: ${candidates.length}`,
		},
		...overrides,
	});
}

describe("importFolderFirst", () => {
	beforeEach(() => {
		for (const fn of [
			findByPathMock,
			createMock,
			finalizeSetupMock,
			requestGitInitMock,
		]) {
			fn.mockClear();
		}
		clientUrls.length = 0;
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
		requestGitInitMock.mockResolvedValue(false);
	});

	it("reports cloud lookup errors instead of creating a duplicate local import when no candidates exist", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);

		const result = await startImport({ onError });

		expect(result).toBeNull();
		expect(clientUrls).toEqual([hostUrl]);
		expect(findByPathMock).toHaveBeenCalledWith({ repoPath });
		expect(onError).toHaveBeenCalledWith(
			"Couldn't reach cloud for https://github.com/octocat/hello.git: cloud-down",
		);
		expect(createMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
	});

	it("imports with init after the user confirms a non-git folder", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(true);
		const onError = mock(() => undefined);

		const result = await startImport({ onError });

		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			repositories: [{ kind: "local", path: repoPath, initIfNeeded: true }],
		});
		const created = {
			projectId: "created-project",
			repositoryId: "repository",
		};
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, created);
		expect(result).toEqual(created);
		expect(onError).not.toHaveBeenCalled();
	});

	it("does nothing when the user cancels the git-init confirmation", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(false);
		const onError = mock(() => undefined);

		const result = await startImport({ onError });

		expect(result).toBeNull();
		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});
});

describe("importFolderFirst with a known folder", () => {
	it("opens the project the folder already belongs to without creating one", async () => {
		createMock.mockClear();
		finalizeSetupMock.mockClear();
		findByPathMock.mockResolvedValue({
			candidates: [
				{
					id: "existing",
					name: "octocat",
					repositoryId: "repo-1",
					repoCloneUrl: null,
					source: "local-path",
				},
			],
			cloudErrors: [],
		});

		const result = await startImport();

		expect(result).toEqual({
			projectId: "existing",
			repositoryId: "repo-1",
		});
		expect(createMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, {
			projectId: "existing",
			repositoryId: "repo-1",
		});
	});

	it("creates a project of one local repository for a new folder", async () => {
		createMock.mockClear();
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });

		const result = await startImport();

		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			repositories: [{ kind: "local", path: repoPath }],
		});
		expect(result).toEqual({
			projectId: "created-project",
			repositoryId: "repository",
		});
	});
});

describe("importFolderFirst with a legacy cloud project", () => {
	const legacy: MatchingProject = {
		id: "legacy",
		name: "Hello",
		repositoryId: "legacy",
		repoCloneUrl: "https://github.com/octocat/hello",
		source: "remote",
	};

	it("sets the one matching project up on this host with the folder", async () => {
		createMock.mockClear();
		setupMock.mockClear();
		findByPathMock.mockResolvedValue({ candidates: [legacy], cloudErrors: [] });

		const result = await startImport();

		expect(setupMock).toHaveBeenCalledWith({
			projectId: "legacy",
			origin: {
				name: "Hello",
				primaryRepositoryId: "legacy",
				repositories: [
					{
						id: "legacy",
						name: "hello",
						url: "https://github.com/octocat/hello",
					},
				],
			},
			repositories: [
				{ id: "legacy", mode: { kind: "import", path: repoPath } },
			],
		});
		expect(createMock).not.toHaveBeenCalled();
		expect(result).toEqual({ projectId: "legacy", repositoryId: "legacy" });
	});

	it("asks the person to choose when several projects match", async () => {
		setupMock.mockClear();
		findByPathMock.mockResolvedValue({
			candidates: [legacy, { ...legacy, id: "other", repositoryId: "other" }],
			cloudErrors: [],
		});
		const onMultipleProjects = mock(() => undefined);

		const result = await startImport({ onMultipleProjects });

		expect(result).toBeNull();
		expect(onMultipleProjects).toHaveBeenCalledTimes(1);
		expect(setupMock).not.toHaveBeenCalled();
	});
});
