import { appendPastedText, parsePastedText } from "@superset/chat/core";
import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

const unsavedDrafts = new Map<string, string>();
const recoveredAfterRead = new Map<string, string[]>();

function persistDraft(draftKey: string, text: string): boolean {
	try {
		if (text === "") window.localStorage.removeItem(draftKey);
		else window.localStorage.setItem(draftKey, text);
		return true;
	} catch (error) {
		console.warn("[chat] could not save the composer draft", error);
		return false;
	}
}

function readDraft(draftKey: string): string | undefined {
	const unsaved = unsavedDrafts.get(draftKey);
	if (unsaved !== undefined) return unsaved;
	try {
		return window.localStorage.getItem(draftKey) ?? undefined;
	} catch {
		return undefined;
	}
}

function joinDrafts(drafts: readonly string[]): string {
	const parts = drafts.map(parsePastedText);
	return appendPastedText(
		parts
			.map((part) => part.text)
			.filter(Boolean)
			.join("\n\n"),
		parts.flatMap((part) => part.pastes),
	);
}

export function prependToDraft(
	draftKey: string,
	texts: readonly string[],
	persisted = true,
) {
	const merged = joinDrafts([...texts, readDraft(draftKey) ?? ""]);
	unsavedDrafts.set(draftKey, merged);
	if (persisted) persistDraft(draftKey, merged);
	recoveredAfterRead.set(draftKey, [
		...(recoveredAfterRead.get(draftKey) ?? []),
		...texts,
	]);
}

export function takeRecoveredDraftText(draftKey: string): string | null {
	const recovered = recoveredAfterRead.get(draftKey);
	recoveredAfterRead.delete(draftKey);
	return recovered?.length ? joinDrafts(recovered) : null;
}

export function useComposerDraft(draftKey: string, persisted = true) {
	const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingDraftKey = useRef<string | null>(null);
	const flushDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		const key = pendingDraftKey.current;
		pendingDraftKey.current = null;
		if (key === null) return;
		const text = unsavedDrafts.get(key);
		if (text !== undefined && persistDraft(key, text)) {
			unsavedDrafts.delete(key);
		}
	}, []);
	const onChange = useCallback(
		(text: string) => {
			if (!persisted) {
				if (text === "") unsavedDrafts.delete(draftKey);
				else unsavedDrafts.set(draftKey, text);
				return;
			}
			if (draftTimer.current) clearTimeout(draftTimer.current);
			unsavedDrafts.set(draftKey, text);
			pendingDraftKey.current = draftKey;
			draftTimer.current = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
		},
		[draftKey, persisted, flushDraft],
	);
	useEffect(() => flushDraft, [flushDraft]);

	const [seed, setSeed] = useState(() => {
		recoveredAfterRead.delete(draftKey);
		return { draftKey, text: readDraft(draftKey) };
	});

	const clearDraft = useCallback(() => {
		unsavedDrafts.delete(draftKey);
		if (persisted) {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			draftTimer.current = null;
			pendingDraftKey.current = null;
			persistDraft(draftKey, "");
		}
		setSeed({ draftKey, text: undefined });
	}, [draftKey, persisted]);

	if (seed.draftKey !== draftKey) {
		recoveredAfterRead.delete(draftKey);
		setSeed({ draftKey, text: readDraft(draftKey) });
	}

	return {
		storedDraft: seed.draftKey === draftKey ? seed.text : readDraft(draftKey),
		onChange,
		clearDraft,
	};
}
