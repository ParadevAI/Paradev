import type { MachineSize } from "@superset/shared/billing";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2WorkspaceCreateBaseBranchSource = "local" | "remote-tracking";

export interface V2WorkspaceCreateBaseBranchDefault {
	branchName: string;
	source: V2WorkspaceCreateBaseBranchSource;
}

export type WorkspaceCreateTarget = "device" | "cloud";

export type WorkspaceCreateProjectChoice =
	| { kind: "project"; projectId: string }
	| { kind: "none" };

export interface CloudCreateChoice {
	environmentId?: string;
	machineSize?: MachineSize;
	usedAt: number;
}

/** The `cloudChoices` key for a cloud workspace without a project. */
export const NO_PROJECT_KEY = "";
export const MAX_CLOUD_CHOICES = 50;

/** Base-branch defaults for cloud are per environment: its repository is what branches. */
export function environmentBranchKey(environmentId: string): string {
	return `environment:${environmentId}`;
}

export function rememberCloudChoice(
	choices: Record<string, CloudCreateChoice>,
	key: string,
	patch: Partial<Omit<CloudCreateChoice, "usedAt">>,
	now: number,
): Record<string, CloudCreateChoice> {
	const next = {
		...choices,
		[key]: { ...choices[key], ...patch, usedAt: now },
	};
	const keys = Object.keys(next);
	if (keys.length <= MAX_CLOUD_CHOICES) return next;
	const oldest = keys
		.sort((a, b) => next[a].usedAt - next[b].usedAt)
		.slice(0, keys.length - MAX_CLOUD_CHOICES);
	for (const key of oldest) delete next[key];
	return next;
}

/** The newest remembered value of `field` across every project. */
export function latestCloudChoice<K extends "environmentId" | "machineSize">(
	choices: Record<string, CloudCreateChoice>,
	field: K,
	accept: (value: NonNullable<CloudCreateChoice[K]>) => boolean = () => true,
): NonNullable<CloudCreateChoice[K]> | null {
	let latest: { value: NonNullable<CloudCreateChoice[K]>; at: number } | null =
		null;
	for (const choice of Object.values(choices)) {
		const value = choice[field];
		if (value == null || !accept(value)) continue;
		if (!latest || choice.usedAt > latest.at) {
			latest = { value, at: choice.usedAt };
		}
	}
	return latest?.value ?? null;
}

interface V2WorkspaceCreateDefaultsState {
	/** The last device project; quick create opens on it. */
	lastProjectId: string | null;
	lastProjectChoice: Partial<
		Record<WorkspaceCreateTarget, WorkspaceCreateProjectChoice>
	>;
	baseBranchesByProjectId: Record<string, V2WorkspaceCreateBaseBranchDefault>;
	lastHostId: string | null;
	checkout: "worktree" | "local";
	/** Keyed by project id, `NO_PROJECT_KEY` for none. Capped at `MAX_CLOUD_CHOICES`. */
	cloudChoices: Record<string, CloudCreateChoice>;
	/** User closed the sample-prompt suggestions on the create surface. */
	samplePromptsDismissed: boolean;

	setLastProjectId: (projectId: string | null) => void;
	setLastProjectChoice: (
		target: WorkspaceCreateTarget,
		choice: WorkspaceCreateProjectChoice,
	) => void;
	setBaseBranchDefault: (
		projectId: string,
		branchName: string,
		source: V2WorkspaceCreateBaseBranchSource,
	) => void;
	clearBaseBranchDefault: (projectId: string) => void;
	setLastHostId: (hostId: string | null) => void;
	setCheckout: (checkout: "worktree" | "local") => void;
	setCloudChoice: (
		key: string,
		patch: Partial<Omit<CloudCreateChoice, "usedAt">>,
	) => void;
	setSamplePromptsDismissed: (dismissed: boolean) => void;
}

export const useV2WorkspaceCreateDefaultsStore =
	create<V2WorkspaceCreateDefaultsState>()(
		devtools(
			persist(
				(set) => ({
					lastProjectId: null,
					lastProjectChoice: {},
					baseBranchesByProjectId: {},
					lastHostId: null,
					checkout: "worktree",
					cloudChoices: {},
					samplePromptsDismissed: false,

					setLastProjectId: (projectId) => set({ lastProjectId: projectId }),

					setLastProjectChoice: (target, choice) =>
						set((state) => ({
							lastProjectChoice: {
								...state.lastProjectChoice,
								[target]: choice,
							},
						})),

					setBaseBranchDefault: (projectId, branchName, source) => {
						const trimmed = branchName.trim();
						if (!trimmed) return;
						set((state) => ({
							baseBranchesByProjectId: {
								...state.baseBranchesByProjectId,
								[projectId]: { branchName: trimmed, source },
							},
						}));
					},

					clearBaseBranchDefault: (projectId) =>
						set((state) => {
							if (!(projectId in state.baseBranchesByProjectId)) return state;
							const next = { ...state.baseBranchesByProjectId };
							delete next[projectId];
							return { baseBranchesByProjectId: next };
						}),

					setLastHostId: (hostId) => set({ lastHostId: hostId }),

					setCheckout: (checkout) => set({ checkout }),

					setCloudChoice: (key, patch) =>
						set((state) => ({
							cloudChoices: rememberCloudChoice(
								state.cloudChoices,
								key,
								patch,
								Date.now(),
							),
						})),

					setSamplePromptsDismissed: (dismissed) =>
						set({ samplePromptsDismissed: dismissed }),
				}),
				{
					name: "v2-workspace-create-defaults",
					version: 3,
					migrate: (state, fromVersion) => {
						let next = state as Record<string, unknown>;
						if (fromVersion < 2 && next && typeof next === "object") {
							const oldTarget = next.lastHostTarget as
								| { kind: "local" }
								| { kind: "host"; hostId: string }
								| null
								| undefined;
							const lastHostId =
								oldTarget && oldTarget.kind === "host"
									? oldTarget.hostId
									: null;
							const { lastHostTarget: _omit, ...rest } = next;
							next = { ...rest, lastHostId };
						}
						if (fromVersion < 3 && next && typeof next === "object") {
							const lastProjectId = next.lastProjectId;
							next = {
								...next,
								lastProjectChoice:
									typeof lastProjectId === "string"
										? {
												device: { kind: "project", projectId: lastProjectId },
											}
										: {},
								checkout: "worktree",
								cloudChoices: {},
							};
						}
						return next as unknown as V2WorkspaceCreateDefaultsState;
					},
				},
			),
			{ name: "V2WorkspaceCreateDefaultsStore" },
		),
	);
