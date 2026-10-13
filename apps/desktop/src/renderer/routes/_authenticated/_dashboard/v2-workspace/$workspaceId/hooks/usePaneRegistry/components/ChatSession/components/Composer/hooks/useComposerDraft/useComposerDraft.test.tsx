import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { prependToDraft, takeRecoveredDraftText, useComposerDraft } =
	await import("./useComposerDraft");

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
test("a composer mounted before the save delay reads text typed into the one it replaces", () => {
	const connecting = renderHook(() =>
		useComposerDraft("chat-v3-draft:handoff"),
	);
	act(() => connecting.result.current.onChange("typed while connecting"));

	const connected = renderHook(() => useComposerDraft("chat-v3-draft:handoff"));
	connecting.unmount();

	expect(connected.result.current.storedDraft).toBe("typed while connecting");
});

test("recovered text survives the composer's own save on unmount", () => {
	const recoveredFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-a"),
	);
	act(() => recoveredFirst.result.current.onChange("newer draft"));
	prependToDraft("chat-v3-draft:recover-a", "unsent message");
	recoveredFirst.unmount();
	expect(window.localStorage.getItem("chat-v3-draft:recover-a")).toBe(
		"unsent message\n\nnewer draft",
	);

	const flushedFirst = renderHook(() =>
		useComposerDraft("chat-v3-draft:recover-b"),
	);
	act(() => flushedFirst.result.current.onChange("newer draft"));
	flushedFirst.unmount();
	prependToDraft("chat-v3-draft:recover-b", "unsent message");
	expect(window.localStorage.getItem("chat-v3-draft:recover-b")).toBe(
		"unsent message\n\nnewer draft",
	);
});

test("a draft that fails to save is still read from memory", () => {
	const setItem = spyOn(window.localStorage, "setItem").mockImplementation(
		() => {
			throw new Error("QuotaExceededError");
		},
	);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		const first = renderHook(() => useComposerDraft("chat-v3-draft:quota"));
		act(() => first.result.current.onChange("kept in memory"));
		first.unmount();

		const next = renderHook(() => useComposerDraft("chat-v3-draft:quota"));
		expect(next.result.current.storedDraft).toBe("kept in memory");
	} finally {
		setItem.mockRestore();
		warn.mockRestore();
	}
});

test("text recovered after a composer read its draft is handed to it once", () => {
	renderHook(() => useComposerDraft("chat-v3-draft:late"));
	prependToDraft("chat-v3-draft:late", "unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:late")).toBe("unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:late")).toBeNull();

	prependToDraft("chat-v3-draft:early", "unsent message");
	const reader = renderHook(() => useComposerDraft("chat-v3-draft:early"));
	expect(reader.result.current.storedDraft).toBe("unsent message");
	expect(takeRecoveredDraftText("chat-v3-draft:early")).toBeNull();
});

test("an accepted upload/send after unmount clears the submitted persisted draft", async () => {
	const { submitMessage } = await import("../../utils/submitMessage");
	const key = "chat-v3-draft:accepted-after-unmount";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("  submitted text  "));
	const upload = Promise.withResolvers<string[]>();
	const finishSubmission =
		composer.result.current.beginSubmission("submitted text");
	const pending = submitMessage(
		{ text: "submitted text", files: [], mentions: [], steer: false },
		{ uploadAttachments: () => upload.promise, onSend: async () => true },
	);
	composer.unmount();
	upload.resolve([]);
	finishSubmission((await pending) !== false);
	expect(window.localStorage.getItem(key)).toBeNull();
	const remounted = renderHook(() => useComposerDraft(key));
	expect(remounted.result.current.storedDraft).toBeUndefined();
});

test("rejected or thrown submissions preserve the unmounted draft", async () => {
	const { submitMessage } = await import("../../utils/submitMessage");
	for (const rejection of [false, new Error("not accepted")]) {
		const key = `chat-v3-draft:rejected-${String(rejection)}`;
		const composer = renderHook(() => useComposerDraft(key));
		act(() => composer.result.current.onChange("keep this"));
		const finish = composer.result.current.beginSubmission("keep this");
		composer.unmount();
		try {
			const result = await submitMessage(
				{ text: "keep this", files: [], mentions: [], steer: false },
				{
					uploadAttachments: async () => [],
					onSend: async () => {
						if (rejection instanceof Error) throw rejection;
						return rejection;
					},
				},
			);
			finish(result !== false);
		} catch {
			finish(false);
		}
		expect(window.localStorage.getItem(key)).toBe("keep this");
	}
});

test("a raw edit and undo invalidate a pending submission", () => {
	const key = "chat-v3-draft:submission-aba";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("  same text  "));
	const finish = composer.result.current.beginSubmission("same text");
	act(() => composer.result.current.onChange("same text"));
	act(() => composer.result.current.onChange("  same text  "));
	composer.unmount();
	finish(true);
	expect(window.localStorage.getItem(key)).toBe("  same text  ");
});

test("recovered text invalidates a pending submission", () => {
	const key = "chat-v3-draft:submission-recovery";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("submitted"));
	const finish = composer.result.current.beginSubmission("submitted");
	prependToDraft(key, "recovered queued message");
	composer.unmount();
	finish(true);
	expect(window.localStorage.getItem(key)).toBe(
		"recovered queued message\n\nsubmitted",
	);
});

test("a different mount of the same draft can edit while a submission settles", () => {
	const key = "chat-v3-draft:submission-other-mount";
	const first = renderHook(() => useComposerDraft(key));
	act(() => first.result.current.onChange("submitted"));
	const finish = first.result.current.beginSubmission("submitted");
	const second = renderHook(() => useComposerDraft(key));
	act(() => second.result.current.onChange("newer draft"));
	first.unmount();
	finish(true);
	second.unmount();
	expect(window.localStorage.getItem(key)).toBe("newer draft");
});

test("a newer same-key submission replaces the older receipt", () => {
	const key = "chat-v3-draft:submission-newer";
	const first = renderHook(() => useComposerDraft(key));
	act(() => first.result.current.onChange("submitted"));
	const older = first.result.current.beginSubmission("submitted");
	const second = renderHook(() => useComposerDraft(key));
	const newer = second.result.current.beginSubmission("submitted");
	first.unmount();
	second.unmount();
	older(true);
	expect(window.localStorage.getItem(key)).toBe("submitted");
	newer(true);
	expect(window.localStorage.getItem(key)).toBeNull();
});

test("acceptance retains an empty memory fallback when storage removal fails", () => {
	const key = "chat-v3-draft:submission-remove-failure";
	const composer = renderHook(() => useComposerDraft(key));
	act(() => composer.result.current.onChange("submitted"));
	const finish = composer.result.current.beginSubmission("submitted");
	composer.unmount();
	const removeItem = spyOn(
		window.localStorage,
		"removeItem",
	).mockImplementation(() => {
		throw new Error("SecurityError");
	});
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		finish(true);
		const next = renderHook(() => useComposerDraft(key));
		expect(next.result.current.storedDraft).toBe("");
		act(() => next.result.current.onChange("newer draft"));
		next.unmount();
		expect(window.localStorage.getItem(key)).toBe("newer draft");
	} finally {
		removeItem.mockRestore();
		warn.mockRestore();
	}
});

test("a submission keeps its original draft key across navigation", () => {
	const firstKey = "chat-v3-draft:submission-navigation-a";
	const secondKey = "chat-v3-draft:submission-navigation-b";
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key: firstKey },
	});
	act(() => composer.result.current.onChange("submitted"));
	const finish = composer.result.current.beginSubmission("submitted");
	composer.rerender({ key: secondKey });
	act(() => composer.result.current.onChange("next chat draft"));
	finish(true);
	composer.unmount();
	expect(window.localStorage.getItem(firstKey)).toBeNull();
	expect(window.localStorage.getItem(secondKey)).toBe("next chat draft");
});

test("acceptance clears the mounted seed before navigating back to the same draft", () => {
	const key = "chat-v3-draft:submission-seeded-navigation";
	window.localStorage.setItem(key, "submitted");
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	const finish = composer.result.current.beginSubmission("submitted");
	act(() => finish(true));
	composer.rerender({
		key: "chat-v3-draft:submission-seeded-navigation-other",
	});
	composer.rerender({ key });
	expect(composer.result.current.storedDraft).toBeUndefined();
});

test("acceptance cannot restore the seed of a replacement mount", () => {
	const key = "chat-v3-draft:submission-replacement-seed";
	window.localStorage.setItem(key, "submitted");
	const first = renderHook(() => useComposerDraft(key));
	const finish = first.result.current.beginSubmission("submitted");
	const replacement = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	first.unmount();
	act(() => finish(true));
	replacement.rerender({ key: "chat-v3-draft:submission-replacement-other" });
	replacement.rerender({ key });
	expect(replacement.result.current.storedDraft).toBeUndefined();
});

test("a temporary storage read failure keeps the mounted draft seed", () => {
	const key = "chat-v3-draft:seed-read-failure";
	window.localStorage.setItem(key, "keep this draft");
	const composer = renderHook(() => useComposerDraft(key));
	const getItem = spyOn(window.localStorage, "getItem").mockImplementation(
		() => {
			throw new Error("SecurityError");
		},
	);
	try {
		composer.rerender();
		expect(composer.result.current.storedDraft).toBe("keep this draft");
	} finally {
		getItem.mockRestore();
	}
});

test("acceptance while navigated away clears the original cached seed", () => {
	const key = "chat-v3-draft:submission-away-seed";
	window.localStorage.setItem(key, "submitted");
	const composer = renderHook(({ key }) => useComposerDraft(key), {
		initialProps: { key },
	});
	const finish = composer.result.current.beginSubmission("submitted");
	composer.rerender({ key: "chat-v3-draft:submission-away-other" });
	finish(true);
	composer.rerender({ key });
	expect(composer.result.current.storedDraft).toBeUndefined();
});
