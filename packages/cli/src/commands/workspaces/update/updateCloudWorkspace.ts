import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export type CloudVisibility = "just_me" | "org";

export interface CloudWorkspaceUpdate {
	name?: string;
	tags?: string[];
	/** A task id or slug to link; null unlinks every linked task. */
	task?: string | null;
	visibility?: CloudVisibility;
	addLabels?: string[];
	removeLabels?: string[];
}

/** Every field lives in the API, so none of these wakes the sandbox. */
export async function updateCloudWorkspace(
	api: ApiClient,
	id: string,
	update: CloudWorkspaceUpdate,
) {
	const result: Record<string, unknown> = { id };

	if (update.name !== undefined) {
		Object.assign(
			result,
			await api.cloudWorkspace.rename.mutate({ id, name: update.name }),
		);
	}
	if (update.tags !== undefined) {
		Object.assign(
			result,
			await api.cloudWorkspace.setTags.mutate({ id, tags: update.tags }),
		);
	}
	if (update.visibility !== undefined) {
		Object.assign(
			result,
			await api.cloudWorkspace.setVisibility.mutate({
				id,
				visibility: update.visibility,
			}),
		);
	}

	const needsRecord =
		update.task === null || (update.removeLabels?.length ?? 0) > 0;
	const record = needsRecord
		? await api.cloudWorkspace.get.query({ id })
		: null;

	if (update.task === null) {
		const unlinked: string[] = [];
		for (const task of record?.tasks ?? []) {
			await api.cloudWorkspace.unlinkTask.mutate({ id, taskId: task.id });
			unlinked.push(task.id);
		}
		result.unlinkedTaskIds = unlinked;
	} else if (update.task !== undefined) {
		const task = await api.task.byIdOrSlug.query(update.task);
		if (!task) throw new CLIError(`Task not found: ${update.task}`);
		await api.cloudWorkspace.linkTask.mutate({ id, taskId: task.id });
		result.linkedTaskId = task.id;
	}

	if (update.addLabels?.length) {
		const added: string[] = [];
		for (const name of update.addLabels) {
			await api.cloudWorkspace.addLabel.mutate({ id, name });
			added.push(name);
		}
		result.addedLabels = added;
	}
	if (update.removeLabels?.length) {
		const labels = record?.labels ?? [];
		const removed: string[] = [];
		for (const name of update.removeLabels) {
			const label = labels.find(
				(candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
			);
			if (!label) {
				throw new CLIError(
					`Cloud workspace ${id} has no label "${name}"`,
					labels.length
						? `Its labels: ${labels.map((candidate) => candidate.name).join(", ")}`
						: "It has no labels",
				);
			}
			await api.cloudWorkspace.removeLabel.mutate({ id, labelId: label.id });
			removed.push(label.name);
		}
		result.removedLabels = removed;
	}

	return result;
}
