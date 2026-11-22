import { describe, expect, it } from "bun:test";
import { hostSentryOptions } from "./sentry";

const DSN = "https://public@o0.ingest.sentry.io/0";

function sendsLines(env: NodeJS.ProcessEnv): boolean {
	const options = hostSentryOptions(env, "org");
	if (!options) return false;
	const integrations = Array.isArray(options.integrations)
		? options.integrations
		: [];
	const consoleLogs = integrations.some((i) => i.name === "ConsoleLogs");
	return Boolean(options.enableLogs || options.beforeSendLog || consoleLogs);
}

describe("hostSentryOptions", () => {
	it("never sends log lines from a desktop user's own host-service, flag or not", () => {
		expect(sendsLines({ HOST_SERVICE_SENTRY_DSN: DSN })).toBe(false);
		expect(
			sendsLines({
				HOST_SERVICE_SENTRY_DSN: DSN,
				SUPERSET_HOST_RUN_MODE: "local",
				SUPERSET_SANDBOX_BOX_LOGS: "1",
			}),
		).toBe(false);
		expect(
			sendsLines({
				HOST_SERVICE_SENTRY_DSN: DSN,
				SUPERSET_SANDBOX_BOX_LOGS: "1",
			}),
		).toBe(false);
	});

	it("sends nothing from a box whose organization does not have the flag", () => {
		expect(
			sendsLines({
				HOST_SERVICE_SENTRY_DSN: DSN,
				SUPERSET_HOST_RUN_MODE: "sandbox",
			}),
		).toBe(false);
	});

	it("sends a flagged box's lines through the filter", () => {
		const env = {
			HOST_SERVICE_SENTRY_DSN: DSN,
			SUPERSET_HOST_RUN_MODE: "sandbox",
			SUPERSET_SANDBOX_BOX_LOGS: "1",
			HOST_SERVICE_SECRET: "hs_6c1f0b9e2d8a4f7e93b5c0d1a2e3f4b5",
		};
		expect(sendsLines(env)).toBe(true);
		expect(
			hostSentryOptions(env, "org")?.beforeSendLog?.({
				level: "info",
				message: `[sandbox] gate ${env.HOST_SERVICE_SECRET}`,
				attributes: { "sentry.origin": "auto.log.console" },
			}),
		).toEqual({
			level: "info",
			message: "box.logs.withheld",
			attributes: { "sentry.origin": "auto.log.console" },
		});
	});
});
