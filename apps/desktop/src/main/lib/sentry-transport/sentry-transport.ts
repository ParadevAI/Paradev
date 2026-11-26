import { isTelemetryEnabled } from "@superset/agent-setup/telemetry";
import { gateSentryTransport } from "@superset/shared/sentry-gate";

export function telemetryGatedTransport<
	Options,
	Envelope,
	Response,
	T extends {
		send(envelope: Envelope): PromiseLike<Response>;
		flush(timeout?: number): PromiseLike<boolean>;
	},
>(makeTransport: (options: Options) => T): (options: Options) => T {
	return gateSentryTransport(makeTransport, () => isTelemetryEnabled());
}
