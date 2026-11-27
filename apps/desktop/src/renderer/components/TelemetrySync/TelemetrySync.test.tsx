import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { isTelemetryEnabled, setTelemetryEnabled } = await import(
	"renderer/lib/telemetry"
);
const { TelemetrySync } = await import("./TelemetrySync");

afterEach(() => {
	cleanup();
	setTelemetryEnabled(true);
});

describe("TelemetrySync", () => {
	test("a change made in another window applies without a refetch", async () => {
		let pushChange: ((state: unknown) => void) | undefined;
		const link: TRPCLink<AppRouter> = () => (call) =>
			observable((observer) => {
				if (call.op.path === "settings.getTelemetryState") {
					observer.next({
						result: { data: { enabled: true, doNotTrack: false } },
					});
					observer.complete();
				}
				if (call.op.path === "settings.onTelemetryChange") {
					observer.next({ result: { type: "started" } } as never);
					pushChange = (state) =>
						observer.next({ result: { type: "data", data: state } } as never);
				}
			});
		const queryClient = new QueryClient();
		render(
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [link] })}
				queryClient={queryClient}
			>
				<TelemetrySync />
			</electronTrpc.Provider>,
		);
		await waitFor(() => expect(pushChange).toBeDefined());
		expect(isTelemetryEnabled()).toBe(true);

		await act(async () => {
			pushChange?.({ enabled: false, doNotTrack: false });
		});

		await waitFor(() => expect(isTelemetryEnabled()).toBe(false));
	});
});
