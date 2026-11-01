import { workspaceViews } from "@superset/local-db";
import { eq } from "drizzle-orm";
import {
	type WorkspaceView,
	workspaceViewSchema,
} from "shared/workspace-views";
import { localDb } from "../local-db";
import type { WorkspaceViewStorage } from "./workspace-views";

function parse(data: string): WorkspaceView | undefined {
	try {
		const result = workspaceViewSchema.safeParse(JSON.parse(data));
		return result.success ? (result.data as WorkspaceView) : undefined;
	} catch {
		return undefined;
	}
}

export const localDbWorkspaceViewStorage: WorkspaceViewStorage = {
	readAll: () =>
		localDb
			.select()
			.from(workspaceViews)
			.all()
			.flatMap((row) => parse(row.data) ?? []),
	read: (workspaceId) => {
		const row = localDb
			.select()
			.from(workspaceViews)
			.where(eq(workspaceViews.workspaceId, workspaceId))
			.get();
		return row ? parse(row.data) : undefined;
	},
	write: (view) => {
		const data = JSON.stringify(view);
		const updatedAt = Date.now();
		localDb
			.insert(workspaceViews)
			.values({ workspaceId: view.workspaceId, data, updatedAt })
			.onConflictDoUpdate({
				target: workspaceViews.workspaceId,
				set: { data, updatedAt },
			})
			.run();
	},
	delete: (workspaceId) => {
		localDb
			.delete(workspaceViews)
			.where(eq(workspaceViews.workspaceId, workspaceId))
			.run();
	},
};
