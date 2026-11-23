import * as Sentry from "@sentry/core";
import { SANDBOX_TELEMETRY_KEYS } from "@superset/shared/sandbox/contract";

export type ControlEvent =
	| "workspace.failed"
	| "boot.refused"
	| "boot.authorized"
	| "boot.released"
	| "meter.cap_reached"
	| "meter.cap_stopped"
	| "workspace.asleep"
	| "workspace.awake"
	| "wake.failed"
	| "wake.completed"
	| "workspace.archived"
	| "archive.stopped"
	| "archive.deleted";

export interface ControlScope {
	cloudWorkspaceId: string;
	organizationId: string;
	bootId?: string | null;
}

export function controlTags(scope: ControlScope): Record<string, string> {
	return {
		[SANDBOX_TELEMETRY_KEYS.cloudWorkspaceId]: scope.cloudWorkspaceId,
		[SANDBOX_TELEMETRY_KEYS.organizationId]: scope.organizationId,
		...(scope.bootId ? { "boot.id": scope.bootId } : {}),
	};
}

export function logControl(
	event: ControlEvent,
	scope: ControlScope,
	attributes: Record<string, string | number | boolean> = {},
	level: "info" | "warn" | "error" = "info",
): void {
	Sentry.logger[level](event, {
		"log.source": "control",
		...controlTags(scope),
		...attributes,
	});
}
