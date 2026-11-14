import { useLingui } from "@lingui/react/macro";
import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
} from "@superset/shared/page-comments-runtime";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { PageFrameHandle, PageFrameProps } from "./PageFrame.types";

/** The page in an iframe; it posts to this window as its parent. */
export const PageFrame = forwardRef<PageFrameHandle, PageFrameProps>(
	function PageFrame({ src, insetTop, onMessage, onLoadEnd }, ref) {
		const { t } = useLingui();
		const frameRef = useRef<HTMLIFrameElement>(null);
		const [loadCount, setLoadCount] = useState(0);

		useImperativeHandle(ref, () => ({
			send: (message) => {
				frameRef.current?.contentWindow?.postMessage(
					{ channel: HOST_CHANNEL, ...message },
					"*",
				);
			},
			reload: () => setLoadCount((count) => count + 1),
		}));

		useEffect(() => {
			const onWindowMessage = (event: MessageEvent) => {
				if (event.source !== frameRef.current?.contentWindow) return;
				const data = event.data as FrameMessage | null;
				if (data?.channel !== FRAME_CHANNEL) return;
				onMessage(data);
			};
			window.addEventListener("message", onWindowMessage);
			return () => window.removeEventListener("message", onWindowMessage);
		}, [onMessage]);

		return (
			<iframe
				key={loadCount}
				ref={frameRef}
				title={t({ message: "Page" })}
				src={src}
				onLoad={onLoadEnd}
				allow="clipboard-write; fullscreen"
				style={{
					flex: 1,
					width: "100%",
					height: "100%",
					border: 0,
					paddingTop: insetTop,
					backgroundColor: "transparent",
				}}
			/>
		);
	},
);
