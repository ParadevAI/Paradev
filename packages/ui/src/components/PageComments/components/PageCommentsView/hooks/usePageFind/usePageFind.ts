"use client";

import {
	FRAME_CHANNEL,
	type FrameMessage,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import {
	type RefObject,
	useCallback,
	useEffect,
	useReducer,
	useRef,
} from "react";
import {
	INITIAL_PAGE_FIND_STATE,
	type PageFindState,
	pageFindReducer,
} from "./utils/pageFindState";

const ANSWER_TIMEOUT_MS = 2000;

export interface PageFindOptions {
	/** Bump to open the bar, or to focus and select its query when it is open. */
	request: number;
	/** Canonical chords the frame hands back as a find request while it has focus. */
	chords: readonly string[];
}

export interface PageFind {
	state: PageFindState;
	setQuery: (query: string) => void;
	next: () => void;
	previous: () => void;
	close: () => void;
}

export function usePageFind({
	frameRef,
	frameOrigin,
	send,
	options,
	answerTimeoutMs = ANSWER_TIMEOUT_MS,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	send: (message: HostMessageBody) => void;
	options?: PageFindOptions;
	answerTimeoutMs?: number;
}): PageFind {
	const [state, dispatch] = useReducer(
		pageFindReducer,
		INITIAL_PAGE_FIND_STATE,
	);
	const enabled = Boolean(options);
	const request = options?.request ?? 0;
	const chordsKey = options?.chords.join("\n") ?? "";

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as FrameMessage | undefined;
			if (!data || data.channel !== FRAME_CHANNEL) return;
			if (data.type === "ready") {
				dispatch({ type: "frame-ready", features: data.features });
			}
			if (data.type === "find-result")
				dispatch({ type: "result", result: data });
			if (data.type === "find-shortcut" && enabled) dispatch({ type: "open" });
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [enabled, frameOrigin, frameRef]);

	const seenRequest = useRef(request);
	useEffect(() => {
		if (request === seenRequest.current) return;
		seenRequest.current = request;
		if (enabled) dispatch({ type: "open" });
	}, [enabled, request]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch resends to a runtime that just started
	useEffect(() => {
		send({
			type: "set-find-chords",
			chords: chordsKey ? chordsKey.split("\n") : [],
		});
	}, [chordsKey, send, state.frameEpoch]);

	const { open, query, availability, frameEpoch } = state;

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch searches a document that just loaded
	useEffect(() => {
		if (availability !== "available") return;
		send(open ? { type: "find", query } : { type: "find-clear" });
	}, [availability, frameEpoch, open, query, send]);

	useEffect(() => {
		if (!open || availability !== "unknown") return;
		send({ type: "ready" });
		const timer = setTimeout(
			() => dispatch({ type: "no-answer" }),
			answerTimeoutMs,
		);
		return () => clearTimeout(timer);
	}, [answerTimeoutMs, availability, open, send]);

	const setQuery = useCallback(
		(next: string) => dispatch({ type: "query", query: next }),
		[],
	);
	const next = useCallback(() => send({ type: "find-step", delta: 1 }), [send]);
	const previous = useCallback(
		() => send({ type: "find-step", delta: -1 }),
		[send],
	);
	const close = useCallback(() => dispatch({ type: "close" }), []);

	return { state, setQuery, next, previous, close };
}
