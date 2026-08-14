import { COMPANY } from "@superset/shared/constants";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStarNagStore } from "renderer/stores/star-nag";

export type GithubStarActionState =
	| "loading"
	| "not_starred"
	| "unknown"
	| "starred";

/**
 * Shared check-star-repo/star-repo/open-web-fallback flow, reused by every
 * "Star Superset on GitHub" surface (settings row, empty-state pill,
 * threshold card). Starring successfully from any surface permanently mutes
 * the threshold nag everywhere else via useStarNagStore.markCompleted().
 */
export function useGithubStarAction() {
	const { data: checkResult, isSuccess } =
		electronTrpc.githubStar.checkStarred.useQuery();
	const starMutation = electronTrpc.githubStar.star.useMutation();
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();
	const completed = useStarNagStore((s) => s.completed);
	const markCompleted = useStarNagStore((s) => s.markCompleted);
	// Overrides the query result once the user has acted, so the UI reflects
	// the outcome immediately instead of waiting on a refetch.
	const [override, setOverride] = useState<GithubStarActionState | null>(null);

	// `completed` wins over everything else, including a fresh mount's own
	// query result: GitHub's starred-check API has been observed to flap
	// between 204 and 404 on rapid successive calls, so a component that
	// remounts (e.g. a new empty-state pill on a different workspace) must
	// not re-show the ask just because it happened to poll during a flaky
	// "not_starred" read. Once any surface has ever confirmed starred, every
	// surface stays permanently suppressed regardless of later query noise.
	const state: GithubStarActionState = completed
		? "starred"
		: (override ?? (isSuccess ? checkResult : "loading"));

	// The repo can already be starred from outside the app (e.g. the user
	// starred it on github.com, or via `gh` directly) — treat that exactly
	// like a fresh star action so every other surface stops nagging too.
	useEffect(() => {
		if (checkResult === "starred") markCompleted();
	}, [checkResult, markCompleted]);

	const activate = () => {
		if (state === "unknown") {
			openUrlMutation.mutate(COMPANY.GITHUB_URL);
			return;
		}
		if (state !== "not_starred") return;
		setOverride("starred");
		starMutation.mutate(undefined, {
			onSuccess: (starred) => {
				if (starred) {
					markCompleted();
				} else {
					setOverride("unknown");
				}
			},
			onError: () => setOverride("unknown"),
		});
	};

	return {
		state,
		activate,
		isBusy: starMutation.isPending || openUrlMutation.isPending,
	};
}
