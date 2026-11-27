import type { FormValues } from "@superset/chat/core";
import { create } from "zustand";

export interface QuestionDraft {
	values: FormValues;
	pageIndex: number;
}

interface QuestionDraftStore {
	drafts: Record<string, Record<string, QuestionDraft>>;
	save: (chatKey: string, itemId: string, draft: QuestionDraft) => void;
	clear: (chatKey: string, itemId: string) => void;
	forget: (chatKey: string) => void;
}

export const useQuestionDraftStore = create<QuestionDraftStore>()((set) => ({
	drafts: {},
	save: (chatKey, itemId, draft) =>
		set((state) => ({
			drafts: {
				...state.drafts,
				[chatKey]: { ...state.drafts[chatKey], [itemId]: draft },
			},
		})),
	clear: (chatKey, itemId) =>
		set((state) => {
			const chat = state.drafts[chatKey];
			if (!chat || !(itemId in chat)) return state;
			const { [itemId]: _cleared, ...rest } = chat;
			const { [chatKey]: _chat, ...others } = state.drafts;
			return {
				drafts:
					Object.keys(rest).length > 0
						? { ...others, [chatKey]: rest }
						: others,
			};
		}),
	forget: (chatKey) =>
		set((state) => {
			if (!(chatKey in state.drafts)) return state;
			const { [chatKey]: _forgotten, ...rest } = state.drafts;
			return { drafts: rest };
		}),
}));
