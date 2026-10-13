import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

const unsavedDrafts = new Map<string, string>();
const recoveredAfterRead = new Map<string, string[]>();
const pendingSubmissions = new Map<string, { text: string }>();

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

export function prependToDraft(draftKey: string, text: string) {
	pendingSubmissions.delete(draftKey);
	const current = readDraft(draftKey);
	const merged = current ? `${text}\n\n${current}` : text;
	unsavedDrafts.set(draftKey, merged);
	persistDraft(draftKey, merged);
	recoveredAfterRead.set(draftKey, [
		...(recoveredAfterRead.get(draftKey) ?? []),
		text,
	]);
}

export function takeRecoveredDraftText(draftKey: string): string | null {
	const recovered = recoveredAfterRead.get(draftKey);
	recoveredAfterRead.delete(draftKey);
	return recovered?.length ? recovered.join("\n\n") : null;
}

export function useComposerDraft(draftKey: string) {
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
			const submission = pendingSubmissions.get(draftKey);
			if (submission && submission.text !== text)
				pendingSubmissions.delete(draftKey);
			if (draftTimer.current) clearTimeout(draftTimer.current);
			unsavedDrafts.set(draftKey, text);
			pendingDraftKey.current = draftKey;
			draftTimer.current = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
		},
		[draftKey, flushDraft],
	);
	useEffect(() => flushDraft, [flushDraft]);

	const [seed, setSeed] = useState(() => {
		recoveredAfterRead.delete(draftKey);
		return { draftKey, text: readDraft(draftKey) };
	});

	const beginSubmission = useCallback(
		(text: string) => {
			pendingSubmissions.delete(draftKey);
			const submitted = { text: readDraft(draftKey) ?? "" };
			if (submitted.text.trim() !== text.trim()) return () => {};
			pendingSubmissions.set(draftKey, submitted);
			return (accepted: boolean) => {
				if (pendingSubmissions.get(draftKey) !== submitted) return;
				pendingSubmissions.delete(draftKey);
				if (!accepted || (readDraft(draftKey) ?? "") !== submitted.text) return;
				unsavedDrafts.set(draftKey, "");
				if (persistDraft(draftKey, "")) unsavedDrafts.delete(draftKey);
			};
		},
		[draftKey],
	);

	const clearDraft = useCallback(() => {
		pendingSubmissions.delete(draftKey);
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		pendingDraftKey.current = null;
		unsavedDrafts.set(draftKey, "");
		if (persistDraft(draftKey, "")) unsavedDrafts.delete(draftKey);
		setSeed({ draftKey, text: undefined });
	}, [draftKey]);

	const storedDraft =
		seed.draftKey === draftKey ? seed.text : readDraft(draftKey);

	return { storedDraft, onChange, clearDraft, beginSubmission };
}
