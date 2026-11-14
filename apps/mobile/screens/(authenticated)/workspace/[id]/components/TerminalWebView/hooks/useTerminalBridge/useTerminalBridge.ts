import { buildHostRoutingKey } from "@superset/shared/host-routing";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import {
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { AppState } from "react-native";
import { useOpenLink } from "@/hooks/useOpenLink";
import { getHostAuthToken, getRelayUrl } from "@/lib/host/client";
import { ensureSandboxAccess, isSandboxHost } from "@/lib/sandbox-access";
import {
	readWarmTerminal,
	rememberWarmTerminal,
} from "@/lib/terminal/warmTerminalCache";
import type {
	PageMessage,
	TerminalWebViewHandle,
	TerminalWebViewProps,
} from "../../TerminalWebView.types";

/**
 * The page side of the terminal bridge, shared by the WebView and the
 * browser iframe: signs dial URLs, relays UI intents, and lends the page what
 * it can't do itself. `postToPage` delivers one JSON message to the page.
 */
export function useTerminalBridge(
	{
		workspaceId,
		terminalId,
		host,
		onStateChange,
		onControl,
		onSelectChange,
		onCopied,
		onTap,
		onScrollChange,
	}: TerminalWebViewProps,
	ref: Ref<TerminalWebViewHandle>,
	postToPage: (message: object) => void,
): { html: string; handleMessage: (data: string) => void } {
	// Callbacks go through refs so onMessage identity stays stable — remounting
	// the WebView on a parent re-render would drop the live socket.
	const onStateChangeRef = useRef(onStateChange);
	onStateChangeRef.current = onStateChange;
	const onControlRef = useRef(onControl);
	onControlRef.current = onControl;
	const onSelectChangeRef = useRef(onSelectChange);
	onSelectChangeRef.current = onSelectChange;
	const onCopiedRef = useRef(onCopied);
	onCopiedRef.current = onCopied;
	const onTapRef = useRef(onTap);
	onTapRef.current = onTap;
	const onScrollChangeRef = useRef(onScrollChange);
	onScrollChangeRef.current = onScrollChange;
	const openLink = useOpenLink({ workspaceId });
	const openLinkRef = useRef(openLink);
	openLinkRef.current = openLink;

	// Parsing the ~400KB generated module is deferred to first mount instead of
	// app startup (expo-router requires route modules eagerly).
	const html = useMemo(
		() =>
			(
				require("../../terminalHtml.generated") as {
					TERMINAL_HTML: string;
				}
			).TERMINAL_HTML,
		[],
	);

	// Signed per attempt, never cached: the relay wants a fresh JWT and a
	// sandbox's edge token expires, so a redial after a long background must
	// re-mint rather than reuse the URL that worked last time.
	const buildDialUrl = useCallback(
		async (dialTerminalId: string, seq: string): Promise<string> => {
			const query = [
				`workspaceId=${encodeURIComponent(workspaceId)}`,
				"themeType=dark",
				// The page's position in the PTY stream: an epoch:seq anchor
				// asks for the bytes it missed, "new" for the ring tail,
				// "none" to reanchor without overwriting restored content.
				`seq=${encodeURIComponent(seq)}`,
			];
			const path = `/terminal/${encodeURIComponent(dialTerminalId)}`;
			if (isSandboxHost(host.machineId)) {
				// A browser can't put a header on a WebSocket upgrade, so the
				// sandbox's host-service reads its token from the query string.
				const access = await ensureSandboxAccess(host.machineId);
				query.push(`token=${encodeURIComponent(access.token)}`);
				return `${access.url.replace(/^http/, "ws")}${path}?${query.join("&")}`;
			}
			query.push(`token=${encodeURIComponent(await getHostAuthToken())}`);
			const base = getRelayUrl().replace(/^http/, "ws");
			const routingKey = buildHostRoutingKey(
				host.organizationId,
				host.machineId,
			);
			return `${base}/hosts/${routingKey}${path}?${query.join("&")}`;
		},
		[host.machineId, host.organizationId, workspaceId],
	);

	// The host runs the PTY at the smallest box across the clients that are
	// actually showing the terminal, so this screen has to say when it stops
	// being one of them — a phone left attached in a pocket would otherwise hold
	// every desktop pane at phone width. Neither unmount nor socket state can
	// stand in for it: expo-router keeps a pushed-over screen mounted and its
	// socket alive, so screen focus and app foreground are both required.
	const [screenFocused, setScreenFocused] = useState(true);
	useFocusEffect(
		useCallback(() => {
			setScreenFocused(true);
			return () => setScreenFocused(false);
		}, []),
	);

	const [appActive, setAppActive] = useState(
		() => AppState.currentState === "active",
	);
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			setAppActive(state === "active");
			if (state === "active") postToPage({ type: "resume" });
		});
		return () => subscription.remove();
	}, [postToPage]);

	// Seeded from the values above rather than a bare `true`, so the `ready`
	// handshake reports the truth even if it somehow beats the effect below.
	// Held in a ref so the handshake doesn't re-run on every change.
	const visibleRef = useRef(screenFocused && appActive);

	const handleMessage = useCallback(
		(data: string) => {
			let message: PageMessage;
			try {
				message = JSON.parse(data) as PageMessage;
			} catch {
				return;
			}
			if (message.type === "ready") {
				// The page boots believing it is visible, so a visibility change
				// that landed before it booted was dropped on the floor — and a
				// phone that was already backgrounded would then attach declaring
				// itself visible, holding the PTY at phone width for everyone
				// else. `ready` precedes the page's first connect, so re-asserting
				// here lands before it attaches.
				postToPage({ type: "visible", visible: visibleRef.current });
				// The page waits for this before dialling, so whatever we hold
				// for this session is painted first and the attach asks only for
				// what came after it.
				postToPage({
					type: "attach",
					terminalId,
					restore: readWarmTerminal(terminalId),
				});
				return;
			}
			if (message.type === "snapshot") {
				rememberWarmTerminal(message.terminalId, {
					data: message.data,
					epoch: message.epoch,
					seq: message.seq,
				});
				return;
			}
			if (message.type === "dial") {
				// The page names the session it is dialling for: a pooled session
				// behind the active tab redials on resume, and a backstop start
				// (null) means whichever tab is current.
				const { id, seq } = message;
				buildDialUrl(message.terminalId ?? terminalId, seq)
					.then((url) => postToPage({ type: "dialUrl", id, url }))
					.catch((error: unknown) =>
						postToPage({
							type: "dialUrl",
							id,
							error: error instanceof Error ? error.message : "dial failed",
						}),
					);
			} else if (message.type === "state") {
				onStateChangeRef.current(message.state);
			} else if (message.type === "control") {
				onControlRef.current(message.message);
			} else if (message.type === "openUrl") {
				openLinkRef.current(message.url);
			} else if (message.type === "copy") {
				void Clipboard.setStringAsync(message.text).then(
					() => onCopiedRef.current?.(),
					// Failed write: stay quiet rather than toast a false "Copied".
					() => {},
				);
			} else if (message.type === "select") {
				onSelectChangeRef.current?.({
					active: message.active,
					hasSelection: message.hasSelection,
				});
			} else if (message.type === "tap") {
				onTapRef.current?.();
			} else if (message.type === "scroll") {
				onScrollChangeRef.current?.(message.atBottom);
			}
		},
		[buildDialUrl, postToPage, terminalId],
	);

	useEffect(() => {
		const visible = screenFocused && appActive;
		visibleRef.current = visible;
		postToPage({ type: "visible", visible });
	}, [screenFocused, appActive, postToPage]);

	// Tab switches swap sessions inside the live page instead of remounting
	// the WebView — a remount pays the 400KB xterm parse and two cold TLS
	// handshakes on every switch; a switch back to a session the page still
	// holds is a repaint from memory. If the page isn't booted yet the message
	// is lost harmlessly: its first dial request signs whatever terminalId is
	// current.
	const mountedTerminalId = useRef(terminalId);
	useEffect(() => {
		if (mountedTerminalId.current === terminalId) return;
		mountedTerminalId.current = terminalId;
		postToPage({
			type: "switch",
			terminalId,
			restore: readWarmTerminal(terminalId),
		});
	}, [terminalId, postToPage]);

	useImperativeHandle(
		ref,
		() => ({
			sendInput: (data: string) => postToPage({ type: "input", data }),
			focus: () => postToPage({ type: "focus" }),
			retry: () => postToPage({ type: "resume" }),
			copySelection: () => postToPage({ type: "copySelection" }),
			scrollToBottom: () => postToPage({ type: "scrollToBottom" }),
		}),
		[postToPage],
	);

	return { html, handleMessage };
}
