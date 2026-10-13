import { createContext, useContext } from "react";

/** How the Activity section lays its items out: cards on a rail, or folded rows in a narrow pane. */
export type PullRequestActivityLayout = "card" | "row";

const PullRequestActivityLayoutContext =
	createContext<PullRequestActivityLayout>("card");

export const PullRequestActivityLayoutProvider =
	PullRequestActivityLayoutContext.Provider;

export function usePullRequestActivityLayout(): PullRequestActivityLayout {
	return useContext(PullRequestActivityLayoutContext);
}
