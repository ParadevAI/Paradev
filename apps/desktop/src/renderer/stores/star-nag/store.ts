import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const STAR_NAG_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface StarNagState {
	/** Muted — starred from any surface (or detected already-starred). Cleared if the repo is later confirmed unstarred, see useGithubStarAction. */
	completed: boolean;
	/** When `completed` last became true; `null` only if never completed — the persist `merge` config backfills this to "now" on rehydration for pre-timestamp-schema profiles, so a null here always means "never". */
	completedAt: number | null;
	/** Cooldown expiry after the onboarding toast was dismissed or timed out; `null` means no active cooldown. */
	deferredUntil: number | null;
	/** Not permanently muted and not within an active cooldown. */
	isEligible: () => boolean;
	snooze: () => void;
	markCompleted: () => void;
	/** Repo confirmed unstarred after previously being completed — unmutes every surface and starts the standard cooldown. */
	markUnstarred: () => void;
}

function isEligible(state: Pick<StarNagState, "completed" | "deferredUntil">) {
	if (state.completed) return false;
	if (state.deferredUntil && state.deferredUntil > Date.now()) return false;
	return true;
}

/**
 * Backfills `completedAt` for profiles rehydrated from the pre-timestamp
 * schema (`completed: true`, no `completedAt`) — otherwise every
 * pre-existing starred user is exposed to the flaky-204/404 checkStarred
 * read on their very first post-rollout check, with none of the grace
 * window that protects a newly-completed user. Exported standalone, like
 * the other decision functions in this module, so it's unit-testable
 * without exercising zustand's persist rehydration.
 */
export function backfillCompletedAt<
	T extends Pick<StarNagState, "completed" | "completedAt">,
>(
	merged: T,
	now: number,
): Omit<T, "completedAt"> & { completedAt: number | null } {
	if (merged.completed && merged.completedAt == null) {
		return { ...merged, completedAt: now };
	}
	return merged;
}

export const useStarNagStore = create<StarNagState>()(
	devtools(
		persist(
			(set, get) => ({
				completed: false,
				completedAt: null,
				deferredUntil: null,
				isEligible: () => isEligible(get()),
				snooze: () => set({ deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS }),
				markCompleted: () =>
					set({
						completed: true,
						completedAt: Date.now(),
						deferredUntil: null,
					}),
				markUnstarred: () =>
					set({
						completed: false,
						completedAt: null,
						deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
					}),
			}),
			// Fixed-size singleton, not entity-keyed — no bound/deletion path needed
			// per apps/desktop/AGENTS.md. If the star nag is ever removed (it's
			// flag-killable by design), move "star-nag-v1" into DEAD_KEYS
			// (renderer/lib/persisted-keys/persisted-keys.ts) in the same PR.
			{
				name: "star-nag-v1",
				// Profiles that completed under the pre-completedAt schema
				// rehydrate with completed: true, completedAt: null.
				// shouldUnmuteOnUnstarredRead treats a null completedAt as "trust
				// the next not_starred read immediately" — reasonable for an
				// account we truly can't date, but that describes every
				// pre-existing starred user the instant this ships, exposing the
				// whole existing population to the exact flaky-204/404 read this
				// grace window exists to absorb. Stamping "now" here instead gives
				// them the same fresh grace window a newly-completed user gets.
				merge: (persisted, current) =>
					backfillCompletedAt(
						{ ...current, ...(persisted as Partial<StarNagState>) },
						Date.now(),
					),
			},
		),
		{ name: "StarNagStore" },
	),
);
