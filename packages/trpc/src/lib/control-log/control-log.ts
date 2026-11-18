import * as Sentry from "@sentry/core";

export type ControlLevel = "info" | "warn" | "error";

export interface ControlScope {
	cloudWorkspaceId: string;
	organizationId: string;
	bootId?: string | null;
}

type Fields = Record<string, string | number | boolean | undefined>;

/**
 * Every control-plane event and its fields. A field is an id, a count, a
 * duration, a flag or one of our own enum values: never free text, a URL, a
 * claim, a credential or an error message.
 */
export interface ControlEvents {
	"workspace.created": {
		"machine.size": string;
		"repositories.count": number;
		"launch.agent"?: string;
	};
	"workspace.failed": {
		"failure.site": "provision" | "queue" | "sandbox_unavailable";
		"error.class": string;
		"status.changed": boolean;
		"sandbox.kept"?: boolean;
	};
	"workspace.archived": {
		trigger: "user" | "move_failed";
		"workspace.from_status"?: string;
	};
	"workspace.unarchived": { "box.resumable": boolean };
	"workspace.awake": { "sandbox.session_id"?: string };
	"workspace.asleep": { "sandbox.session_id"?: string };
	"provision.started": Record<never, never>;
	"provision.skipped": { "workspace.status": string };
	"provision.awake": { ms: number };
	"provision.abandoned": { "box.deleted": boolean };
	"provision.completed": { ms: number };
	"wake.started": Record<never, never>;
	"wake.completed": {
		ms: number;
		"box.resumed": boolean;
		"box.rebooted": boolean;
	};
	"wake.failed": {
		ms: number;
		"error.class": string;
		"sandbox.unavailable": boolean;
	};
	"restart.started": { "box.running": boolean };
	"boot.authorized": {
		"box.vcpus": number;
		"box.memory_mb": number;
		"lock.open": boolean;
	};
	"boot.refused": { refusal: string };
	"boot.attached": { "sandbox.session_id": string };
	"boot.released": { reason: BootReleaseReason; "lock.open": boolean };
	"boot.adopted": { "box.vcpus": number; "box.memory_mb": number };
	"meter.settled": {
		outcome: "renewed" | "warned" | "stopped" | "closed";
		"usage.gb_minutes"?: number;
	};
	"meter.cap_reached": { stop_in_ms: number };
	"meter.cap_stopped": { source: "settle" | "reconcile" };
	"meter.settle_failed": { "error.class": string };
	"archive.hook_ran": { "hook.status": string };
	"archive.stopped": Record<never, never>;
	"archive.deleted": Record<never, never>;
	"step.failed": { step: ControlStep; "error.class": string };
}

export type BootReleaseReason =
	| "provision_failed"
	| "provision_abandoned"
	| "session_taken"
	| "never_attached"
	| "sandbox_lost"
	| "adopt_failed";

/** A side step whose failure does not stop the operation it belongs to. */
export type ControlStep =
	| "archive.hook"
	| "archive.activity"
	| "boot.release"
	| "boot.trace"
	| "chat_moves.fail"
	| "chat_moves.queue"
	| "files.anchor"
	| "files.reap"
	| "lock.release"
	| "meter.settle"
	| "move.end"
	| "naming"
	| "reap.queue"
	| "reap.stop_queue"
	| "sandbox.teardown"
	| "setup.rerun";

export type ControlEvent = keyof ControlEvents;

export const CONTROL_EVENT_LEVELS: { [E in ControlEvent]: ControlLevel } = {
	"workspace.created": "info",
	"workspace.failed": "error",
	"workspace.archived": "info",
	"workspace.unarchived": "info",
	"workspace.awake": "info",
	"workspace.asleep": "info",
	"provision.started": "info",
	"provision.skipped": "info",
	"provision.awake": "info",
	"provision.abandoned": "info",
	"provision.completed": "info",
	"wake.started": "info",
	"wake.completed": "info",
	"wake.failed": "error",
	"restart.started": "info",
	"boot.authorized": "info",
	"boot.refused": "warn",
	"boot.attached": "info",
	"boot.released": "info",
	"boot.adopted": "info",
	"meter.settled": "info",
	"meter.cap_reached": "warn",
	"meter.cap_stopped": "warn",
	"meter.settle_failed": "error",
	"archive.hook_ran": "info",
	"archive.stopped": "info",
	"archive.deleted": "info",
	"step.failed": "warn",
};

export interface ControlRecord {
	level: ControlLevel;
	body: ControlEvent;
	attributes: Record<string, string | number | boolean>;
}

/** `error` reaches only the console line; a record carries its class. */
export type ControlSink = (record: ControlRecord, error?: unknown) => void;

export function errorClass(error: unknown): string {
	if (error instanceof Error) return error.constructor.name || error.name;
	return error === null ? "null" : typeof error;
}

export function controlTags(scope: ControlScope): Record<string, string> {
	return {
		"cloud_workspace.id": scope.cloudWorkspaceId,
		"organization.id": scope.organizationId,
		...(scope.bootId ? { "boot.id": scope.bootId } : {}),
	};
}

export function controlRecord<E extends ControlEvent>(
	event: E,
	scope: ControlScope,
	fields: ControlEvents[E],
): ControlRecord {
	const attributes: ControlRecord["attributes"] = {
		"log.source": "control",
		...controlTags(scope),
	};
	for (const [key, value] of Object.entries(fields as Fields)) {
		if (value !== undefined) attributes[key] = value;
	}
	return { level: CONTROL_EVENT_LEVELS[event], body: event, attributes };
}

const CONSOLE_METHOD = { info: "log", warn: "warn", error: "error" } as const;

export const sentryControlSink: ControlSink = (record, error) => {
	Sentry.logger[record.level](record.body, record.attributes);
	const line = `[cloud-workspace] ${record.body} ${JSON.stringify(record.attributes)}`;
	const write = console[CONSOLE_METHOD[record.level]];
	if (error === undefined) write(line);
	else write(line, error);
};

export type ControlCapture = (
	error: unknown,
	scope: ControlScope,
	extra?: Record<string, unknown>,
) => void;

export const sentryControlCapture: ControlCapture = (error, scope, extra) => {
	Sentry.captureException(error, {
		tags: controlTags(scope),
		...(extra ? { extra } : {}),
	});
};

export const controlLog = {
	sink: sentryControlSink,
	capture: sentryControlCapture,
};

/** Never throws: a log line must not change what the operation does. */
export function logControl<E extends ControlEvent>(
	event: E,
	scope: ControlScope,
	fields: ControlEvents[E],
	error?: unknown,
): void {
	try {
		controlLog.sink(controlRecord(event, scope, fields), error);
	} catch {}
}

/** An exception with the workspace, organization and boot as searchable tags. */
export function captureControlException(
	error: unknown,
	scope: ControlScope,
	extra?: Record<string, unknown>,
): void {
	try {
		controlLog.capture(error, scope, extra);
	} catch {}
}

/** `step.failed` for a side step, with the error kept for the console line. */
export function logStepFailed(
	step: ControlStep,
	scope: ControlScope,
	error: unknown,
): void {
	logControl(
		"step.failed",
		scope,
		{ step, "error.class": errorClass(error) },
		error,
	);
}
