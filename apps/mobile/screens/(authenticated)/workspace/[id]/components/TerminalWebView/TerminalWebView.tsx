import { forwardRef, useCallback, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import { useTerminalBridge } from "./hooks/useTerminalBridge";
import type {
	TerminalWebViewHandle,
	TerminalWebViewProps,
} from "./TerminalWebView.types";

const StyledWebView = withUniwind(WebView);

/**
 * Hosts the xterm.js page (terminalHtml.generated.ts) and speaks its bridge
 * protocol. The WebSocket lives inside the page so PTY output never crosses
 * the RN bridge; this side only signs dial URLs (fresh JWT per attempt, same
 * contract as web's TerminalConnection), relays UI intents, and lends the
 * page what a WebView can't do itself: open a tapped link, write the
 * clipboard from select mode.
 */
export const TerminalWebView = forwardRef<
	TerminalWebViewHandle,
	TerminalWebViewProps
>(function TerminalWebView(props, ref) {
	const webViewRef = useRef<WebView>(null);
	const postToPage = useCallback((message: object) => {
		webViewRef.current?.postMessage(JSON.stringify(message));
	}, []);
	const { html, handleMessage } = useTerminalBridge(props, ref, postToPage);
	const onMessage = useCallback(
		(event: WebViewMessageEvent) => handleMessage(event.nativeEvent.data),
		[handleMessage],
	);

	return (
		<StyledWebView
			ref={webViewRef}
			// Scrollback is whatever the agent printed — files, diffs, secrets.
			// A WebView is opaque to autocapture's tree walk today, so this is
			// belt and braces, but it is the subtree that must never be read.
			ph-no-capture
			// Background must match the page's #0a0a0a so resizes don't flash.
			className="flex-1 bg-[#0a0a0a]"
			source={{ html }}
			onMessage={onMessage}
			bounces={false}
			scrollEnabled={false}
			setSupportMultipleWindows={false}
			keyboardDisplayRequiresUserAction={false}
			hideKeyboardAccessoryView
			webviewDebuggingEnabled={__DEV__}
		/>
	);
});
