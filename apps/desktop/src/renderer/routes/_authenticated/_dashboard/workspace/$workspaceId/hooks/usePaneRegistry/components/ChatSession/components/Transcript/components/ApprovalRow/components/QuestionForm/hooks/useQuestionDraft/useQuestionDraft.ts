import type { FormValues } from "@superset/chat/core";
import { useCallback, useEffect } from "react";
import {
	type QuestionDraft,
	useQuestionDraftStore,
} from "../../../../../../../../../../stores/questionDraftStore";
import { useChatKey } from "../../../../../../providers/ChatKeyProvider";

const EMPTY_DRAFT: QuestionDraft = { values: {}, pageIndex: 0 };

export function useQuestionDraft(itemId: string, pending: boolean) {
	const chatKey = useChatKey();
	const draft = useQuestionDraftStore(
		(state) => state.drafts[chatKey]?.[itemId] ?? EMPTY_DRAFT,
	);

	const update = useCallback(
		(change: (draft: QuestionDraft) => QuestionDraft) => {
			const { drafts, save } = useQuestionDraftStore.getState();
			save(chatKey, itemId, change(drafts[chatKey]?.[itemId] ?? EMPTY_DRAFT));
		},
		[chatKey, itemId],
	);

	const setValues = useCallback(
		(change: (values: FormValues) => FormValues) =>
			update((current) => ({ ...current, values: change(current.values) })),
		[update],
	);

	const setPageIndex = useCallback(
		(pageIndex: number) => update((current) => ({ ...current, pageIndex })),
		[update],
	);

	useEffect(() => {
		if (!pending) useQuestionDraftStore.getState().clear(chatKey, itemId);
	}, [chatKey, itemId, pending]);

	return { ...draft, setValues, setPageIndex };
}
