import { useEffect, useRef } from "react";
import { deriveBranchName } from "renderer/routes/_authenticated/utils/deriveBranchName";
import {
	type LinkedIssue,
	type NewWorkspaceDraft,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";

function seedsNames(issue: LinkedIssue): boolean {
	return issue.source === "internal" || issue.source === "linear";
}

export function useLinkedIssueNaming(linkedIssues: LinkedIssue[]): void {
	const previous = useRef<LinkedIssue[]>([]);
	useEffect(() => {
		const before = previous.current;
		previous.current = linkedIssues;
		const store = useNewWorkspaceDraftStore.getState();
		const patch: Partial<NewWorkspaceDraft> = {};
		const added = linkedIssues.find(
			(issue) =>
				seedsNames(issue) && !before.some((prev) => prev.slug === issue.slug),
		);
		if (added) {
			if (!store.branchNameEdited && !store.branchName.trim()) {
				patch.branchName = deriveBranchName(added);
				patch.branchNameEdited = true;
				patch.branchNameFromProvider = !!added.branch?.trim();
			}
			if (!store.workspaceNameEdited && !store.workspaceName.trim()) {
				patch.workspaceName = added.title;
				patch.workspaceNameEdited = true;
			}
		}
		const removed = before.find(
			(issue) =>
				seedsNames(issue) &&
				!linkedIssues.some((next) => next.slug === issue.slug),
		);
		if (removed) {
			const next = linkedIssues.find(seedsNames);
			if (store.branchName === deriveBranchName(removed)) {
				patch.branchName = next ? deriveBranchName(next) : "";
				patch.branchNameEdited = next !== undefined;
				patch.branchNameFromProvider = !!next?.branch?.trim();
			}
			if (store.workspaceName === removed.title) {
				patch.workspaceName = next ? next.title : "";
				patch.workspaceNameEdited = next !== undefined;
			}
		}
		if (Object.keys(patch).length > 0) store.updateDraft(patch);
	}, [linkedIssues]);
}
