import * as Sentry from "@sentry/node";
import type { BuiltinAgentId } from "@superset/shared/agent-catalog";
import { createSentryEventThrottle } from "@superset/shared/sentry-throttle";
import { createBoxLogFilter } from "./runtime/box-log-filter";
import { getManagedEnv } from "./runtime/sandbox-managed-env";
import type { TerminalAgentEndReason } from "./terminal-agents/types";

let initialized = false;

// Shared across the process: the point is to notice a repeat, which needs one
// instance rather than one per call.
const throttleRepeats = createSentryEventThrottle();

export function initSentry(options: { organizationId?: string }): void {
	if (initialized) return;
	const sentryOptions = hostSentryOptions(process.env, options.organizationId);
	if (!sentryOptions) return;
	Sentry.init(sentryOptions);
	initialized = true;
}

export function hostSentryOptions(
	env: NodeJS.ProcessEnv,
	organizationId: string | undefined,
): Sentry.NodeOptions | null {
	const dsn = env.HOST_SERVICE_SENTRY_DSN;
	if (!dsn) return null;
	const tags = {
		service: "host-service",
		organization_id: organizationId,
		run_mode: env.SUPERSET_HOST_RUN_MODE,
		cloud_workspace_id: env.SUPERSET_SANDBOX_WORKSPACE_ID,
		image_tag: env.SUPERSET_SANDBOX_IMAGE_TAG,
		provider: env.SUPERSET_SANDBOX_PROVIDER,
	};
	const boxLogs =
		env.SUPERSET_HOST_RUN_MODE === "sandbox" &&
		env.SUPERSET_SANDBOX_BOX_LOGS === "1";
	return {
		dsn,
		// Explicit: from SDK 10.71 logs are on unless this says otherwise.
		enableLogs: boxLogs,
		beforeSendLog: boxLogs
			? createBoxLogFilter({
					secrets: () =>
						[
							...Object.values(getManagedEnv()),
							env.HOST_SERVICE_SECRET,
							dsn,
						].filter((value): value is string => Boolean(value)),
					reportDropped: (dropped, windowStartedAt) =>
						logBoxEvent(
							"box.logs.dropped",
							{
								"box.logs.dropped": dropped,
								"box.logs.window_started_at": windowStartedAt,
							},
							"warn",
						),
				})
			: undefined,
		release: env.HOST_SERVICE_SENTRY_RELEASE,
		environment: env.HOST_SERVICE_SENTRY_ENVIRONMENT,
		// A host that fails once usually fails in a loop: git.getStatus alone
		// sent 135k copies of one `spawn EBADF` from seven machines last month.
		beforeSend: throttleRepeats,
		// safety.ts keeps the process alive through uncaught exceptions; Sentry
		// must capture them without re-introducing the exit.
		integrations: [
			Sentry.onUncaughtExceptionIntegration({
				exitEvenIfOtherHandlersAreRegistered: false,
			}),
			...(boxLogs
				? [
						Sentry.consoleLoggingIntegration({
							levels: ["log", "info", "warn", "error"],
						}),
					]
				: []),
		],
		initialScope: {
			tags,
			attributes: { ...tags, "log.source": "host-service" },
		},
	};
}

type BoxAgentId = BuiltinAgentId | "custom";

interface BoxEventAttributes {
	"agent.ended": {
		"agent.id": BoxAgentId;
		"agent.end_reason": TerminalAgentEndReason;
		ms: number;
	};
	"box.reaped": { "reap.rss_mb": number; "memory.limit_mb": number };
	"hook.finished": { "hook.exit": number | NodeJS.Signals; ms: number };
	"box.logs.dropped": {
		"box.logs.dropped": number;
		"box.logs.window_started_at": number;
	};
}

/** One of our own events, typed so its attributes stay counts and ids. */
export function logBoxEvent<E extends keyof BoxEventAttributes>(
	event: E,
	attributes: BoxEventAttributes[E],
	level: "info" | "warn" = "info",
): void {
	Sentry.logger[level](event, attributes);
}

/** A file a user attached that the agent did not get. */
export function reportAttachmentResolveFailure(error: unknown): void {
	if (!initialized) return;
	Sentry.captureException(error, { tags: { attachment_resolve: "failed" } });
}

/** A usage scan that crashed its worker, idle or not; the pool pauses after. */
export function reportUsageWorkerCrash(error: unknown): void {
	if (!initialized) return;
	Sentry.captureException(error, { tags: { usage_worker: "crashed" } });
}

export async function captureFatalStartupError(error: unknown): Promise<void> {
	if (!initialized) return;
	Sentry.captureException(error);
	try {
		await Sentry.flush(2_000);
	} catch {
		// Best-effort — the process is exiting either way.
	}
}

// One rescue event per reason per hour: the point is a countable field signal
// that a tunnel wedge occurred and was recovered, not a log firehose from a
// host stuck behind a captive portal all day.
const RESCUE_REPORT_INTERVAL_MS = 60 * 60_000;
const lastRescueReport = new Map<string, number>();

/**
 * Report that tunnel supervision rescued a connection that would previously
 * have wedged the host until a manual restart. Every one of these in the
 * field is a support ticket that didn't happen — and the count is how we
 * confirm the fix works outside the lab.
 */
export function reportTunnelRescue(
	reason: string,
	detail: Record<string, string | number>,
): void {
	if (!initialized) return;
	const now = Date.now();
	const last = lastRescueReport.get(reason) ?? 0;
	if (now - last < RESCUE_REPORT_INTERVAL_MS) return;
	lastRescueReport.set(reason, now);
	Sentry.captureMessage(`tunnel rescue: ${reason}`, {
		level: "warning",
		tags: { tunnel_rescue: reason },
		extra: detail,
	});
}
