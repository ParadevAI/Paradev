import { useLingui } from "@lingui/react/macro";
import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { useTerminalBridge } from "./hooks/useTerminalBridge";
import type {
	TerminalWebViewHandle,
	TerminalWebViewProps,
} from "./TerminalWebView.types";

const BRIDGE_SHIM =
	"<script>window.ReactNativeWebView={postMessage:function(data){parent.postMessage({terminalBridge:data},'*')}};</script>";

/** The xterm.js page in an iframe; the same bridge as the native WebView. */
export const TerminalWebView = forwardRef<
	TerminalWebViewHandle,
	TerminalWebViewProps
>(function TerminalWebView(props, ref) {
	const { t } = useLingui();
	const frameRef = useRef<HTMLIFrameElement>(null);
	const postToPage = useCallback((message: object) => {
		frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
	}, []);
	const { html, handleMessage } = useTerminalBridge(props, ref, postToPage);
	const srcDoc = useMemo(
		() => html.replace("<head>", `<head>${BRIDGE_SHIM}`),
		[html],
	);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = (event.data as { terminalBridge?: unknown } | null)
				?.terminalBridge;
			if (typeof data === "string") handleMessage(data);
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [handleMessage]);

	return (
		<iframe
			ref={frameRef}
			title={t({ message: "Terminal" })}
			data-ph-no-capture
			srcDoc={srcDoc}
			style={{
				flex: 1,
				width: "100%",
				height: "100%",
				border: 0,
				backgroundColor: "#0a0a0a",
			}}
		/>
	);
});
