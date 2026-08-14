import { cn } from "@superset/ui/utils";
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
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState).
 * Hides once starred — either immediately if it was already starred before
 * this mounted, or after a short grace period if the user just starred it
 * here, so the confetti/label animation has time to play.
 */
export function GitHubStarPill({ className }: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const [visible, setVisible] = useState(true);
	const prevStateRef = useRef<GithubStarActionState | null>(null);

	useEffect(() => {
		const prev = prevStateRef.current;
		prevStateRef.current = state;
		const justStarred =
			(prev === "not_starred" || prev === "unknown") && state === "starred";
		if (state === "starred" && !justStarred) {
			setVisible(false);
			return;
		}
		if (justStarred) {
			const timer = setTimeout(
				() => setVisible(false),
				STAR_SUCCESS_ANIMATION_MS,
			);
			return () => clearTimeout(timer);
		}
	}, [state]);

	// Fire at most once per mount — without this guard, a failed star attempt
	// (not_starred -> unknown) reports a second "shown" for the same session,
	// inflating impressions relative to star_nag_starred.
	const trackedShownRef = useRef(false);
	useEffect(() => {
		if (trackedShownRef.current) return;
		if (state !== "not_starred" && state !== "unknown") return;
		trackedShownRef.current = true;
		track("star_nag_shown", { surface: "empty_state" });
	}, [state]);

	if (state === "loading" || !visible) return null;

	const handleClick = () => {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "empty_state",
		});
		activate();
	};

	return (
		<div className={cn("flex items-center justify-center", className)}>
			<AnimatedStarButton
				state={state}
				busy={isBusy}
				onActivate={handleClick}
			/>
		</div>
	);
}
