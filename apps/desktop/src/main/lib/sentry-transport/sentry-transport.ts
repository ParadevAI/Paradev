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

export function telemetryGatedOfflineTransport<
	Options,
	T extends {
		send(envelope: never): PromiseLike<unknown>;
		flush(timeout?: number): PromiseLike<boolean>;
	},
	Offline,
>(
	makeOfflineTransport: (makeBase: (options: Options) => T) => Offline,
	makeBaseTransport: (options: Options) => T,
): Offline {
	return makeOfflineTransport(telemetryGatedTransport(makeBaseTransport));
}
