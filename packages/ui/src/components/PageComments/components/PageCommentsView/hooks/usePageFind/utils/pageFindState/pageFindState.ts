import type { PageFindResult } from "@superset/shared/page-comments-runtime";

export type PageFindAvailability = "unknown" | "available" | "unavailable";

export interface PageFindState {
	open: boolean;
	query: string;
	result: Omit<PageFindResult, "query"> | null;
	availability: PageFindAvailability;
	/** Bumped by every open request, so a repeat focuses and selects the query. */
	focusRequest: number;
	/** Bumped by every frame that can find, so a fresh document is searched again. */
	frameEpoch: number;
}

export type PageFindAction =
	| { type: "open" }
	| { type: "close" }
	| { type: "query"; query: string }
	| { type: "result"; result: PageFindResult }
	| { type: "frame-ready"; features: readonly string[] | undefined }
	| { type: "no-answer" };

export const INITIAL_PAGE_FIND_STATE: PageFindState = {
	open: false,
	query: "",
	result: null,
	availability: "unknown",
	focusRequest: 0,
	frameEpoch: 0,
};

export function pageFindReducer(
	state: PageFindState,
	action: PageFindAction,
): PageFindState {
	switch (action.type) {
		case "open":
			return { ...state, open: true, focusRequest: state.focusRequest + 1 };
		case "close":
			return { ...state, open: false, result: null };
		case "query":
			return { ...state, query: action.query, result: null };
		case "result": {
			const { query, ...result } = action.result;
			if (!state.open || !state.query.trim() || query !== state.query) {
				return state;
			}
			return { ...state, result };
		}
		case "frame-ready":
			return action.features?.includes("find")
				? {
						...state,
						availability: "available",
						result: null,
						frameEpoch: state.frameEpoch + 1,
					}
				: { ...state, availability: "unavailable", result: null };
		case "no-answer":
			return state.availability === "unknown"
				? { ...state, availability: "unavailable" }
				: state;
	}
}
