import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
	AnimatedStarButton,
	STAR_SUCCESS_ANIMATION_MS,
} from "renderer/components/AnimatedStarButton";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";

interface GitHubStarPillProps {
	className?: string;
	/** Analytics surface tag; defaults to "empty_state" for the original callers. */
	surface?: "empty_state" | "new_workspace";
	/**
	 * Keep the pill's layout box mounted (just faded to invisible) instead of
	 * unmounting it once starred. The empty-state screens sit at the bottom of
	 * a plain block, so a height collapse there is harmless; the new-workspace
	 * screen centers its content with `justify-center`, where that same
	 * collapse re-centers everything above it. Off by default so the two
	 * existing callers keep their original unmount-on-hide behavior.
	 */
	reserveSpace?: boolean;
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState) and
 * the new-workspace screen. Renders straight from live `state`, with no
 * nag-suppression layer — unlike the sidebar card/toast, this is a low-key
 * status indicator, not an interruptive campaign, so it's allowed to be
 * fully truthful: it hides the instant `state` is "starred" and reappears
 * the instant a later unstar is confirmed, without waiting on any mute
 * grace window. It briefly stays mounted past that point so the
 * confetti/label animation on a fresh star has time to play, then
 * dissolves out (fade + soft blur) instead of vanishing instantly.
 */
export function GitHubStarPill({
	className,
	surface = "empty_state",
	reserveSpace = false,
}: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const prevStateRef = useRef<GithubStarActionState | null>(null);

	// Computed synchronously during render (not inside the effect below) so
	// the hide check further down can't lag a render behind the state flip.
	// That lag used to unmount this component's child AnimatedStarButton for
	// exactly one render right as `state` became "starred" — before
	// staysVisibleForAnimation had a chance to flip true — which reset
	// AnimatedStarButton's own "was I just starred" ref on remount and
	// silently dropped its confetti/pop celebration.
	const prevState = prevStateRef.current;
	prevStateRef.current = state;
	const justStarred =
		(prevState === "not_starred" || prevState === "unknown") &&
		state === "starred";

	// Separate ref + effect from the render-time justStarred above, and keyed
	// on `state` rather than `justStarred`: `justStarred` itself flips back to
	// false on the very next render (setStaysVisibleForAnimation(true) causes
	// a re-render, and prevStateRef has already advanced to "starred" by
	// then) — if this effect depended on `justStarred` directly, that flip
	// would re-run it, firing the cleanup that cancels the just-started timer
	// before it ever fires, and no replacement timer gets scheduled since
	// justStarred is false by then. Keying on `state` (which only changes
	// once) keeps the timer alive for its full duration instead.
	const [staysVisibleForAnimation, setStaysVisibleForAnimation] =
		useState(false);
	const prevStateForTimerRef = useRef<GithubStarActionState | null>(null);
	useEffect(() => {
		const prev = prevStateForTimerRef.current;
		prevStateForTimerRef.current = state;
		const justStarredForTimer =
			(prev === "not_starred" || prev === "unknown") && state === "starred";
		if (justStarredForTimer) {
			setStaysVisibleForAnimation(true);
			const timer = setTimeout(
				() => setStaysVisibleForAnimation(false),
				STAR_SUCCESS_ANIMATION_MS,
			);
			return () => clearTimeout(timer);
		}
	}, [state]);

	// Fire at most once per showing per surface — reset once starred so a
	// later unstar re-shows the pill and tracks a fresh "shown" impression,
	// and reset again if `surface` itself changes so a re-purposed mounted
	// instance still gets its own impression instead of inheriting the prior
	// surface's guard.
	const trackedShownSurfaceRef = useRef<NonNullable<
		GitHubStarPillProps["surface"]
	> | null>(null);
	useEffect(() => {
		if (state === "starred") {
			trackedShownSurfaceRef.current = null;
			return;
		}
		if (trackedShownSurfaceRef.current === surface) return;
		if (state !== "not_starred" && state !== "unknown") return;
		trackedShownSurfaceRef.current = surface;
		track("star_nag_shown", { surface });
	}, [state, surface]);

	if (state === "loading" && !reserveSpace) return null;

	const isVisible =
		state !== "loading" &&
		!(state === "starred" && !justStarred && !staysVisibleForAnimation);

	const handleClick = () => {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface,
		});
		activate();
	};

	if (reserveSpace) {
		// Always mounted so the button's box keeps occupying its slot — only
		// opacity/interactivity change, never the layout.
		return (
			<motion.div
				animate={{ opacity: isVisible ? 1 : 0 }}
				transition={{ duration: 0.32, ease: "easeOut" }}
				style={{ pointerEvents: isVisible ? "auto" : "none" }}
				aria-hidden={!isVisible}
				inert={!isVisible}
				className={cn("flex items-center justify-center", className)}
			>
				<AnimatedStarButton
					state={state}
					busy={isBusy}
					onActivate={handleClick}
				/>
			</motion.div>
		);
	}

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					key="star-pill"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, scale: 0.92, filter: "blur(3px)" }}
					transition={{ duration: 0.32, ease: "easeOut" }}
					className={cn("flex items-center justify-center", className)}
				>
					<AnimatedStarButton
						state={state}
						busy={isBusy}
						onActivate={handleClick}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
