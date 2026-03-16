import type { ActivePaneStatus } from "shared/tabs-types";

type MockPrState = "open" | "merged" | "closed" | "draft";

export interface WorkspaceRowMockData {
	diffStats: {
		additions: number;
		deletions: number;
	};
	workspaceStatus: ActivePaneStatus | null;
	pr: {
		state: MockPrState;
		number: number;
		title: string;
	} | null;
}

function getSeed(input: string): number {
	return [...input].reduce(
		(seed, character, index) => seed + character.charCodeAt(0) * (index + 1),
		0,
	);
}

export function getWorkspaceRowMocks(
	workspaceId: string,
): WorkspaceRowMockData {
	const seed = getSeed(workspaceId);
	const prStates: MockPrState[] = ["open", "draft", "merged", "closed"];
	const paneStatuses: ActivePaneStatus[] = ["permission", "working", "review"];
	const hasPr = seed % 5 !== 0;
	const status =
		seed % 6 === 0 ? paneStatuses[seed % paneStatuses.length] : null;

	return {
		diffStats: {
			additions: (seed % 24) + 3,
			deletions: (seed % 9) + 1,
		},
		workspaceStatus: status,
		pr: hasPr
			? {
					state: prStates[seed % prStates.length],
					number: 100 + (seed % 900),
					title: "Polish workspace sidebar visuals",
				}
			: null,
	};
}
