"use client";

import {
	type PageToolOutcome,
	type PageToolsFrameMessage,
	TOOLS_HOST_CHANNEL,
} from "@superset/shared/page-tools";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { acceptsFrameMessage } from "./utils/acceptsFrameMessage";
import {
	type PageToolHostBinding,
	pageScopedHost,
} from "./utils/pageScopedHost";
import { readToolCall } from "./utils/readToolCall";
import {
	createPageToolRunner,
	type PageToolAnswer,
	type PageToolHost,
	type PageToolPrompt,
} from "./utils/runPageToolCall";

interface PendingPrompt {
	prompt: PageToolPrompt;
	resolve: (answer: PageToolAnswer) => void;
}

export function usePageTools({
	frameRef,
	frameOrigin,
	host,
	pageId,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	host?: PageToolHost;
	pageId?: string;
}): {
	prompt: PageToolPrompt | null;
	answer: (answer: PageToolAnswer) => void;
} {
	const [prompt, setPrompt] = useState<PageToolPrompt | null>(null);
	const current = useRef<PendingPrompt | null>(null);
	const queue = useRef<PendingPrompt[]>([]);

	const showNext = useCallback(() => {
		if (current.current) return;
		current.current = queue.current.shift() ?? null;
		setPrompt(current.current?.prompt ?? null);
	}, []);

	const answer = useCallback(
		(value: PageToolAnswer) => {
			const entry = current.current;
			if (!entry) return;
			current.current = null;
			entry.resolve(value);
			showNext();
		},
		[showNext],
	);

	const binding = useRef<PageToolHostBinding>({ host, pageId });
	binding.current = { host, pageId };
	const hasHost = Boolean(host);

	const runner = useMemo(() => {
		if (!hasHost) return null;
		const control = { stopped: false };
		const run = createPageToolRunner(
			pageScopedHost(() => binding.current, pageId),
			(next) =>
				new Promise<PageToolAnswer>((resolve) => {
					queue.current.push({ prompt: next, resolve });
					showNext();
				}),
			{ stopped: () => control.stopped },
		);
		return { run, control };
	}, [hasHost, pageId, showNext]);
	const run = runner?.run ?? null;

	useEffect(() => {
		const reply = (body: Record<string, unknown>) =>
			frameRef.current?.contentWindow?.postMessage(
				{ channel: TOOLS_HOST_CHANNEL, ...body },
				frameOrigin,
			);
		const onMessage = async (event: MessageEvent) => {
			if (
				!acceptsFrameMessage(
					event,
					frameOrigin,
					frameRef.current?.contentWindow,
				)
			) {
				return;
			}
			const data = event.data as PageToolsFrameMessage;
			if (data.type === "hello") {
				reply(
					run
						? { type: "ready", available: true }
						: { type: "ready", available: false, reason: "unavailable" },
				);
				return;
			}
			if (data.type !== "call" || !run) return;
			const call = readToolCall(data);
			if (!call) return;
			const outcome: PageToolOutcome = call.request
				? await run(call.request, () =>
						reply({ type: "pending", id: call.id }),
					).catch(
						(): PageToolOutcome => ({
							ok: false,
							code: "unavailable",
							message: "The tool call failed",
						}),
					)
				: { ok: false, code: "invalid", message: "Malformed tool call" };
			reply({ type: "result", id: call.id, ...outcome });
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef, run]);

	useEffect(() => {
		if (!runner) return;
		runner.control.stopped = false;
		return () => {
			runner.control.stopped = true;
			const pending = [
				...(current.current ? [current.current] : []),
				...queue.current,
			];
			current.current = null;
			queue.current = [];
			setPrompt(null);
			for (const entry of pending) entry.resolve({ allow: false });
		};
	}, [runner]);

	return { prompt, answer };
}
