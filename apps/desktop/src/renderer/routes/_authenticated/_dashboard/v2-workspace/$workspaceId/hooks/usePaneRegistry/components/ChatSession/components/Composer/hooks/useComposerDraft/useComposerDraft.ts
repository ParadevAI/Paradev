import { appendPastedText, parsePastedText } from "@superset/chat/core";
import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

const unsavedDrafts = new Map<string, string>();
const recoveredAfterRead = new Map<string, string[]>();
const pendingSubmissions = new Map<string, { text: string }>();
const inFlightSubmissions = new Map<string, { text: string }>();
const clearedDraftListeners = new Map<string, Set<() => void>>();

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

function clearStoredDraft(draftKey: string, persisted: boolean) {
	unsavedDrafts.set(draftKey, "");
	if (!persisted || persistDraft(draftKey, "")) unsavedDrafts.delete(draftKey);
	for (const notify of clearedDraftListeners.get(draftKey) ?? []) notify();
}

function readDraft(draftKey: string, fallback?: string): string | undefined {
	const unsaved = unsavedDrafts.get(draftKey);
	if (unsaved !== undefined) return unsaved;
	try {
		return window.localStorage.getItem(draftKey) ?? undefined;
	} catch {
		return fallback;
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
	pendingSubmissions.delete(draftKey);
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
			const submission = pendingSubmissions.get(draftKey);
			if (submission && submission.text !== text)
				pendingSubmissions.delete(draftKey);
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

	useEffect(() => {
		setSeed((current) => {
			const text = readDraft(
				draftKey,
				current.draftKey === draftKey ? current.text : undefined,
			);
			return current.draftKey === draftKey && current.text === text
				? current
				: { draftKey, text };
		});
		const listeners =
			clearedDraftListeners.get(draftKey) ?? new Set<() => void>();
		const clearSeed = () => setSeed({ draftKey, text: undefined });
		listeners.add(clearSeed);
		clearedDraftListeners.set(draftKey, listeners);
		return () => {
			listeners.delete(clearSeed);
			if (listeners.size === 0) clearedDraftListeners.delete(draftKey);
		};
	}, [draftKey]);

	const beginSubmission = useCallback(
		(text: string, isDraftUnchanged?: () => boolean) => {
			if (inFlightSubmissions.has(draftKey)) return null;
			pendingSubmissions.delete(draftKey);
			const submitted = { text: readDraft(draftKey) ?? "" };
			inFlightSubmissions.set(draftKey, submitted);
			if (submitted.text.trim() === text.trim())
				pendingSubmissions.set(draftKey, submitted);
			return (accepted: boolean) => {
				if (inFlightSubmissions.get(draftKey) !== submitted) return;
				inFlightSubmissions.delete(draftKey);
				if (pendingSubmissions.get(draftKey) !== submitted) return;
				pendingSubmissions.delete(draftKey);
				if (
					!accepted ||
					isDraftUnchanged?.() === false ||
					(readDraft(draftKey) ?? "") !== submitted.text
				)
					return;
				clearStoredDraft(draftKey, persisted);
			};
		},
		[draftKey, persisted],
	);

	const clearDraft = useCallback(() => {
		pendingSubmissions.delete(draftKey);
		if (pendingDraftKey.current === draftKey) {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			draftTimer.current = null;
			pendingDraftKey.current = null;
		}
		clearStoredDraft(draftKey, persisted);
	}, [draftKey, persisted]);

	if (seed.draftKey !== draftKey) {
		recoveredAfterRead.delete(draftKey);
		setSeed({ draftKey, text: readDraft(draftKey) });
	}

	const storedDraft =
		seed.draftKey === draftKey ? seed.text : readDraft(draftKey);

	return { storedDraft, onChange, clearDraft, beginSubmission };
}
