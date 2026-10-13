import {
	type PageToolsHostMessage,
	TOOLS_HOST_CHANNEL,
} from "@superset/shared/page-tools";
import { acceptsFrameMessage } from "../../../usePageTools";

export function unavailableToolsListener(
	frameOrigin: string,
	frameWindow: () => Window | null | undefined,
	signedIn: boolean,
): (event: MessageEvent) => void {
	return (event) => {
		const target = frameWindow();
		if (!acceptsFrameMessage(event, frameOrigin, target)) return;
		if ((event.data as { type?: unknown }).type !== "hello") return;
		const ready: PageToolsHostMessage = {
			channel: TOOLS_HOST_CHANNEL,
			type: "ready",
			available: false,
			reason: signedIn ? "unavailable" : "signed_out",
		};
		target?.postMessage(ready, frameOrigin);
	};
}
