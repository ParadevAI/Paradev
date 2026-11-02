import { useCallback, useEffect, useRef, useState } from "react";
import type {
	WorkspaceCreateProjectChoice,
	WorkspaceCreateTarget,
} from "renderer/stores/v2-workspace-create-defaults";

interface Options {
	isOpen: boolean;
	areProjectsReady: boolean;
	projects: readonly { id: string }[];
	preSelectedProjectId?: string | null;
	preSelectedSession: boolean;
	selectedProjectId: string | null;
	isSession: boolean;
	/** Device and cloud each restore their own last choice when switched to. */
	target: WorkspaceCreateTarget;
	lastChoice: WorkspaceCreateProjectChoice | null;
	selectProject: (id: string) => void;
	selectSession: () => void;
	updateDraft: (patch: { selectedProjectId: string | null }) => void;
}

export function useProjectPreselection({
	isOpen,
	areProjectsReady,
	projects,
	preSelectedProjectId,
	preSelectedSession,
	selectedProjectId,
	isSession,
	target,
	lastChoice,
	selectProject,
	selectSession,
	updateDraft,
}: Options) {
	const [appliedProjectId, setAppliedProjectId] = useState<string | null>(null);
	const appliedSession = useRef(false);
	const restoredTarget = useRef<WorkspaceCreateTarget | null>(null);
	useEffect(() => {
		if (!preSelectedSession) appliedSession.current = false;
	}, [preSelectedSession]);
	useEffect(() => {
		if (!preSelectedProjectId) setAppliedProjectId(null);
	}, [preSelectedProjectId]);
	const isPending = Boolean(
		preSelectedProjectId && preSelectedProjectId !== appliedProjectId,
	);
	useEffect(() => {
		if (!isOpen || !areProjectsReady) return;
		if (preSelectedSession && !appliedSession.current) {
			appliedSession.current = true;
			restoredTarget.current = target;
			selectSession();
			return;
		}
		const isValid = (id: string | null | undefined) =>
			Boolean(id && projects.some((project) => project.id === id));
		if (isPending && preSelectedProjectId) {
			if (isValid(preSelectedProjectId)) {
				restoredTarget.current = target;
				selectProject(preSelectedProjectId);
				setAppliedProjectId(preSelectedProjectId);
			}
			return;
		}
		if (restoredTarget.current !== target) {
			restoredTarget.current = target;
			if (lastChoice?.kind === "none") {
				if (!isSession) selectSession();
				return;
			}
			if (lastChoice?.kind === "project" && isValid(lastChoice.projectId)) {
				if (isSession || selectedProjectId !== lastChoice.projectId)
					selectProject(lastChoice.projectId);
				return;
			}
		}
		if (isSession || isValid(selectedProjectId)) return;
		if (lastChoice?.kind === "none") {
			selectSession();
			return;
		}
		const lastProjectId =
			lastChoice?.kind === "project" ? lastChoice.projectId : null;
		updateDraft({
			selectedProjectId: isValid(lastProjectId)
				? lastProjectId
				: (projects[0]?.id ?? null),
		});
	}, [
		isOpen,
		areProjectsReady,
		preSelectedSession,
		preSelectedProjectId,
		isPending,
		projects,
		selectedProjectId,
		isSession,
		target,
		lastChoice,
		selectProject,
		selectSession,
		updateDraft,
	]);
	const releasePreselection = useCallback(() => {
		if (preSelectedProjectId) setAppliedProjectId(preSelectedProjectId);
	}, [preSelectedProjectId]);
	return {
		isPending: isPending && !preSelectedSession,
		releasePreselection,
	};
}
