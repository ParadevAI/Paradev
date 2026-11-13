import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { workspaces } from "../../db/schema.ts";
import { getLocalProject } from "../../projects/local-project-store.ts";
import { getPrimaryRepository } from "../../projects/repositories.ts";
import { getCheckoutSnapshots } from "../../workspaces/checkouts.ts";
import { getLocalWorkspace } from "../../workspaces/local-workspace-store.ts";
import { WatchAttachGuard } from "./watch-attach-guard.ts";
import {
	scanNestedRepositories,
	scanWorkspaceGitIgnoredDirectories,
} from "./watcher-scans.ts";

export interface WorkspaceFilesystemManagerOptions {
	db: HostDb;
}

export class WorkspaceNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkspaceNotFoundError";
	}
}

export class ProjectNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectNotFoundError";
	}
}

export class WorkspaceFilesystemManager {
	private readonly db: HostDb;
	private readonly watcherManager = new FsWatcherManager({
		useDefaultIgnores: false,
		listGitIgnoredDirs: (rootPath, signal) =>
			scanWorkspaceGitIgnoredDirectories(this.db, rootPath, signal),
		findNestedRepoRoots: scanNestedRepositories,
	});
	private readonly watchAttachGuard = new WatchAttachGuard(this.watcherManager);
	private readonly serviceCache = new Map<string, FsHostService>();

	constructor(options: WorkspaceFilesystemManagerOptions) {
		this.db = options.db;
	}

	resolveWorkspaceRoot(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new WorkspaceNotFoundError(`Workspace not found: ${workspaceId}`);
		}

		return workspace.worktreePath;
	}

	/** Where the primary repository's `.paradev` files are: the root, or `<root>/<primary name>`. */
	resolvePrimaryCheckoutPath(workspaceId: string): string {
		const workspace = getLocalWorkspace(this.db, workspaceId);
		if (!workspace) {
			throw new WorkspaceNotFoundError(`Workspace not found: ${workspaceId}`);
		}
		return (
			getCheckoutSnapshots(this.db, workspace).find(
				(checkout) => checkout.isPrimary,
			)?.path ?? workspace.worktreePath
		);
	}

	resolveProjectRoot(projectId: string): string {
		const project = getLocalProject(this.db, projectId);

		if (!project) {
			throw new ProjectNotFoundError(`Project not found: ${projectId}`);
		}

		const repository = getPrimaryRepository(this.db, project);
		if (!repository) {
			throw new ProjectNotFoundError(`Project not found: ${projectId}`);
		}
		return repository.repoPath;
	}

	getServiceForWorkspace(workspaceId: string): FsHostService {
		return this.getServiceForRootPath(this.resolveWorkspaceRoot(workspaceId));
	}

	getServiceForProject(projectId: string): FsHostService {
		return this.getServiceForRootPath(this.resolveProjectRoot(projectId));
	}

	/**
	 * Whether the workspace's recursive watcher delivers no events for this
	 * path (pruned subtree, outside the root, or no watcher attached). Callers
	 * use it to decide whether an open file needs its own targeted watch.
	 */
	isPathPrunedFromWatch(workspaceId: string, absolutePath: string): boolean {
		return this.watcherManager.isPathPruned(
			this.resolveWorkspaceRoot(workspaceId),
			absolutePath,
		);
	}

	isWatchAttachBackingOff(rootPath: string): boolean {
		return this.watchAttachGuard.isBackingOff(rootPath);
	}

	/**
	 * Swap a watch root's native subscription onto a freshly derived ignore
	 * set. Required after a directory is UN-ignored — the attach-time prune
	 * would otherwise suppress its events until restart. Returns whether the
	 * subscription was actually swapped.
	 */
	async refreshWatcherIgnores(rootPath: string): Promise<boolean> {
		return await this.watcherManager.refreshIgnores(rootPath);
	}

	getServiceForRootPath(rootPath: string): FsHostService {
		let service = this.serviceCache.get(rootPath);
		if (!service) {
			service = createFsHostService({
				rootPath,
				watcherManager: this.watchAttachGuard,
			});
			this.serviceCache.set(rootPath, service);
		}
		return service;
	}

	async close(): Promise<void> {
		this.serviceCache.clear();
		await this.watchAttachGuard.close();
	}
}
