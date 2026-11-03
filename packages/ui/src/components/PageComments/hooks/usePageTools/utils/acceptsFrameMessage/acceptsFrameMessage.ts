import { TOOLS_FRAME_CHANNEL } from "@superset/shared/page-tools";

export function acceptsFrameMessage(
	event: MessageEvent,
	frameOrigin: string,
	frameWindow: Window | null | undefined,
): boolean {
	if (event.origin !== frameOrigin) return false;
	if (!frameWindow || event.source !== frameWindow) return false;
	const data = event.data as { channel?: unknown } | null | undefined;
	return data?.channel === TOOLS_FRAME_CHANNEL;
}
