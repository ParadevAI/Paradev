import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Placeholder starting point, not a researched number — see apps/desktop/plans/20260814-1500-github-star-nag.md. */
export const STAR_NAG_INITIAL_THRESHOLD = 5;
const STAR_NAG_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface StarNagState {
	/** Permanently muted — starred from any surface, or explicitly opted out. */
	completed: boolean;
	/** New (never previously seen) workspaces created since the last reset. */
	workspacesCreatedSinceBaseline: number;
	/** Doubles every time the threshold card is dismissed without starring. */
	nextThreshold: number;
	/** Cooldown expiry after a dismissal; `null` means no active cooldown. */
	deferredUntil: number | null;
	recordWorkspaceCreated: () => void;
	/** Not permanently muted and not within an active cooldown. Shared by every trigger source (threshold card, onboarding toast). */
	isEligible: () => boolean;
	shouldShowThresholdCard: () => boolean;
	/** User saw the threshold card and said "later" (or dismissed it) without starring. */
	dismiss: () => void;
	markCompleted: () => void;
}

function isEligible(state: Pick<StarNagState, "completed" | "deferredUntil">) {
	if (state.completed) return false;
	if (state.deferredUntil && state.deferredUntil > Date.now()) return false;
	return true;
}

export const useStarNagStore = create<StarNagState>()(
	devtools(
		persist(
			(set, get) => ({
				completed: false,
				workspacesCreatedSinceBaseline: 0,
				nextThreshold: STAR_NAG_INITIAL_THRESHOLD,
				deferredUntil: null,
				recordWorkspaceCreated: () =>
					set((s) => ({
						workspacesCreatedSinceBaseline:
							s.workspacesCreatedSinceBaseline + 1,
					})),
				isEligible: () => isEligible(get()),
				shouldShowThresholdCard: () => {
					const s = get();
					return (
						isEligible(s) && s.workspacesCreatedSinceBaseline >= s.nextThreshold
					);
				},
				dismiss: () =>
					set((s) => ({
						nextThreshold: s.nextThreshold * 2,
						workspacesCreatedSinceBaseline: 0,
						deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
					})),
				markCompleted: () => set({ completed: true, deferredUntil: null }),
			}),
			{ name: "star-nag-v1" },
		),
		{ name: "StarNagStore" },
	),
);
