import { createCollection } from "@tanstack/react-db";
import type { WorkspaceView } from "shared/workspace-views";

export type WorkspaceViewChange =
	| { type: "put"; view: WorkspaceView }
	| { type: "remove"; workspaceId: string }
	| { type: "terminal-kept"; workspaceId: string; terminalId: string };

export interface WorkspaceViewsClient {
	list(): Promise<WorkspaceView[]>;
	onChange(handler: (change: WorkspaceViewChange) => void): () => void;
	put(view: WorkspaceView): Promise<unknown>;
	remove(workspaceId: string): Promise<unknown>;
}

interface SyncWriter {
	put(view: WorkspaceView): void;
	remove(workspaceId: string): void;
}

/**
 * Workspace views, synced from the desktop main process, which owns them.
 * Writes apply here at once and are sent to main, which broadcasts them back
 * to every window.
 */
export function createWorkspaceViewsCollection({
	client,
	onTerminalKept,
}: {
	client: WorkspaceViewsClient;
	onTerminalKept: (change: { workspaceId: string; terminalId: string }) => void;
}) {
	let writer: SyncWriter | null = null;

	return createCollection<WorkspaceView, string>({
		id: "v2_workspace_views",
		getKey: (view) => view.workspaceId,
		startSync: true,
		gcTime: 0,
		sync: {
			rowUpdateMode: "full",
			sync: ({ begin, write, commit, markReady }) => {
				const known = new Set<string>();
				const syncWriter: SyncWriter = {
					put: (view) => {
						begin();
						write({
							type: known.has(view.workspaceId) ? "update" : "insert",
							value: view,
						});
						commit();
						known.add(view.workspaceId);
					},
					remove: (workspaceId) => {
						if (!known.delete(workspaceId)) return;
						begin();
						write({ type: "delete", key: workspaceId });
						commit();
					},
				};
				writer = syncWriter;

				let loaded = false;
				const pending: WorkspaceViewChange[] = [];
				const apply = (change: WorkspaceViewChange) => {
					if (change.type === "put") syncWriter.put(change.view);
					else if (change.type === "remove")
						syncWriter.remove(change.workspaceId);
					else onTerminalKept(change);
				};
				const unsubscribe = client.onChange((change) => {
					if (loaded) apply(change);
					else pending.push(change);
				});
				client
					.list()
					.then((views) => {
						for (const view of views) syncWriter.put(view);
					})
					.catch((error) => {
						console.error("[workspaceViews] Initial load failed", error);
					})
					.finally(() => {
						loaded = true;
						for (const change of pending.splice(0)) apply(change);
						markReady();
					});

				return () => {
					unsubscribe();
					if (writer === syncWriter) writer = null;
				};
			},
		},
		onInsert: async ({ transaction }) => {
			for (const mutation of transaction.mutations) {
				await client.put(mutation.modified);
				writer?.put(mutation.modified);
			}
		},
		onUpdate: async ({ transaction }) => {
			for (const mutation of transaction.mutations) {
				await client.put(mutation.modified);
				writer?.put(mutation.modified);
			}
		},
		onDelete: async ({ transaction }) => {
			for (const mutation of transaction.mutations) {
				await client.remove(mutation.key as string);
				writer?.remove(mutation.key as string);
			}
		},
	});
}

export type WorkspaceViewsCollection = ReturnType<
	typeof createWorkspaceViewsCollection
>;
