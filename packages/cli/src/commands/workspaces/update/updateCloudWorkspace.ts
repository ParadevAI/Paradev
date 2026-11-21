import { CLIError } from "@superset/cli-framework";
import type { MachineSize } from "@superset/shared/billing";
import { normalizeLabelName } from "@superset/shared/labels";
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
	machineSize?: MachineSize;
}

export interface CloudWorkspaceResize {
	machineSize: string;
	vcpus: number;
	running: boolean;
	restarted: boolean;
	boxVcpus: number | null;
}

/**
 * Every field but `machineSize` lives in the API and leaves the sandbox alone. Lookups
 * run before the first write, so a bad task or label changes nothing.
 */
export async function updateCloudWorkspace(
	api: ApiClient,
	id: string,
	update: CloudWorkspaceUpdate,
) {
	const needsRecord =
		update.task === null || (update.removeLabels?.length ?? 0) > 0;
	const record = needsRecord
		? await api.cloudWorkspace.get.query({ id })
		: null;

	const linkTaskId =
		typeof update.task === "string"
			? await resolveTaskId(api, update.task)
			: undefined;
	const labelsToRemove = resolveLabels(
		id,
		record?.labels ?? [],
		update.removeLabels ?? [],
	);
	const labelsToAdd = uniqueByNormalized(update.addLabels ?? []);

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

	if (update.task === null) {
		const unlinked: string[] = [];
		for (const task of record?.tasks ?? []) {
			await api.cloudWorkspace.unlinkTask.mutate({ id, taskId: task.id });
			unlinked.push(task.id);
		}
		result.unlinkedTaskIds = unlinked;
	} else if (linkTaskId) {
		await api.cloudWorkspace.linkTask.mutate({ id, taskId: linkTaskId });
		result.linkedTaskId = linkTaskId;
	}

	// Removals first: replacing a label at the label limit must not fail.
	if (labelsToRemove.length) {
		for (const label of labelsToRemove) {
			await api.cloudWorkspace.removeLabel.mutate({ id, labelId: label.id });
		}
		result.removedLabels = labelsToRemove.map((label) => label.name);
	}
	if (labelsToAdd.length) {
		for (const name of labelsToAdd) {
			await api.cloudWorkspace.addLabel.mutate({ id, name });
		}
		result.addedLabels = labelsToAdd;
	}

	// Last: a restart ends every process on the box, so the cheap writes land first.
	if (update.machineSize !== undefined) {
		result.resize = await api.cloudWorkspace.setMachineSize.mutate({
			id,
			machineSize: update.machineSize,
		});
	}

	return result;
}

export function describeResize(
	id: string,
	resize: CloudWorkspaceResize,
): string {
	const target = `${resize.machineSize} (${resize.vcpus} vCPU)`;
	const current = resize.boxVcpus ?? "an unknown number of";
	if (resize.restarted && resize.boxVcpus !== resize.vcpus) {
		return `Restarted cloud workspace ${id}, but the box came up at ${current} vCPU instead of ${target}. Run: superset workspaces restart ${id}`;
	}
	if (resize.restarted) return `Restarted cloud workspace ${id} at ${target}`;
	if (resize.boxVcpus === resize.vcpus) {
		return `Set cloud workspace ${id} to ${target}`;
	}
	return `Set cloud workspace ${id} to ${target}. The box starts at this size when it next wakes`;
}

async function resolveTaskId(api: ApiClient, idOrSlug: string) {
	const task = await api.task.byIdOrSlug.query(idOrSlug);
	if (!task) throw new CLIError(`Task not found: ${idOrSlug}`);
	return task.id;
}

function resolveLabels(
	workspaceId: string,
	labels: { id: string; name: string }[],
	names: string[],
) {
	const resolved = new Map<string, { id: string; name: string }>();
	for (const name of names) {
		const wanted = normalizeLabelName(name);
		const label = labels.find(
			(candidate) => normalizeLabelName(candidate.name) === wanted,
		);
		if (!wanted || !label) {
			throw new CLIError(
				`Cloud workspace ${workspaceId} has no label "${name}"`,
				labels.length
					? `Its labels: ${labels.map((candidate) => candidate.name).join(", ")}`
					: "It has no labels",
			);
		}
		resolved.set(label.id, label);
	}
	return [...resolved.values()];
}

function uniqueByNormalized(names: string[]) {
	const seen = new Set<string>();
	return names.filter((name) => {
		const key = normalizeLabelName(name) ?? name;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
