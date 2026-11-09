import {
	type ShareResourceKind,
	type ShareUiEvent,
	shareUiEventPayload,
} from "@superset/shared/sharing";
import { posthog } from "renderer/lib/posthog";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
}

/** An `onEvent` for a share dialog, reporting it under the shared event names. */
export function trackShareEvent(resourceKind: ShareResourceKind) {
	return (event: ShareUiEvent): void => {
		const { name, properties } = shareUiEventPayload(event, resourceKind);
		track(name, properties);
	};
}
