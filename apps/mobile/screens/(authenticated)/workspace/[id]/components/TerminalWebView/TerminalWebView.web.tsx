import { useLingui } from "@lingui/react/macro";
import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { useReadableInset } from "@/hooks/useReadableInset";
import { useTerminalBridge } from "./hooks/useTerminalBridge";
import type {
	TerminalWebViewHandle,
	TerminalWebViewProps,
} from "./TerminalWebView.types";

const BRIDGE_SHIM =
	"<script>window.ReactNativeWebView={postMessage:function(data){parent.postMessage({terminalBridge:data},'*')}};window.terminalKeyboardInput=!matchMedia('(pointer: coarse)').matches;(function(){var report=function(){var a=document.activeElement;parent.postMessage({terminalFocus:document.hasFocus()&&!!a&&a.tagName==='TEXTAREA'},'*')};addEventListener('focusin',report,true);addEventListener('focusout',function(){setTimeout(report)},true);addEventListener('blur',report)})();</script>";

const WIDE_PADDING = 12;

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
	const wide = useReadableInset() > 0;
	const onKeyboardFocusChangeRef = useRef(props.onKeyboardFocusChange);
	onKeyboardFocusChangeRef.current = props.onKeyboardFocusChange;
	const srcDoc = useMemo(
		() => html.replace("<head>", `<head>${BRIDGE_SHIM}`),
		[html],
	);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const message = event.data as {
				terminalBridge?: unknown;
				terminalFocus?: unknown;
			} | null;
			if (typeof message?.terminalBridge === "string") {
				handleMessage(message.terminalBridge);
			} else if (typeof message?.terminalFocus === "boolean") {
				onKeyboardFocusChangeRef.current?.(message.terminalFocus);
			}
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
				boxSizing: "border-box",
				padding: wide ? WIDE_PADDING : 0,
				backgroundColor: "#0a0a0a",
			}}
		/>
	);
});
