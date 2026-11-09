import {
	type ShareResourceKind,
	type ShareUiEvent,
	shareUiEventPayload,
} from "@superset/shared/sharing";
import { posthog } from "@/lib/posthog";

/**
 * Whether anything was shared since the share sheet opened. The sheet stays
 * mounted under the invite screen, where sharing happens, so the two screens
 * meet here. Only one share sheet is open at a time on mobile.
 */
let sharedSinceOpen = false;

export function resetShareSession(): void {
	sharedSinceOpen = false;
}

export function markShared(): void {
	sharedSinceOpen = true;
}

export function sharedInSession(): boolean {
	return sharedSinceOpen;
}

export function captureShareEvent(
	event: ShareUiEvent,
	resourceKind: ShareResourceKind,
): void {
	const { name, properties } = shareUiEventPayload(event, resourceKind);
	posthog.capture(name, properties);
}
