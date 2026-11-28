import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { isTelemetryEnabled, setTelemetryEnabled } = await import(
	"renderer/lib/telemetry"
);
const { TelemetrySetting } = await import("./TelemetrySetting");

afterEach(() => {
	cleanup();
	setTelemetryEnabled(true);
});

describe("TelemetrySetting", () => {
	test("the click that turns it off is not autocaptured and stops capture before the save finishes, then asks for a restart", async () => {
		const link: TRPCLink<AppRouter> = () => (call) =>
			observable((observer) => {
				if (call.op.path === "settings.getTelemetryState") {
					observer.next({
						result: { data: { enabled: true, doNotTrack: false } },
					});
					observer.complete();
				}
			});
		const view = render(
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [link] })}
				queryClient={new QueryClient()}
			>
				<TelemetrySetting />
			</electronTrpc.Provider>,
		);
		const toggle = view.container.querySelector(
			"#telemetry",
		) as HTMLButtonElement;
		await waitFor(() => expect(toggle.disabled).toBe(false));

		expect(toggle.closest(".ph-no-capture")).not.toBeNull();
		expect(view.queryByText("Restart Paradev to apply")).toBeNull();

		await act(async () => {
			fireEvent.click(toggle);
		});
		expect(isTelemetryEnabled()).toBe(false);
		expect(await view.findByText("Restart Paradev to apply")).not.toBeNull();
	});

	test("a failed save puts telemetry back to the restored setting", async () => {
		const link: TRPCLink<AppRouter> = () => (call) =>
			observable((observer) => {
				if (call.op.path === "settings.getTelemetryState") {
					observer.next({
						result: { data: { enabled: true, doNotTrack: false } },
					});
					observer.complete();
				}
				if (call.op.path === "settings.setTelemetryEnabled") {
					observer.error(new Error("disk full") as never);
				}
			});
		const view = render(
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [link] })}
				queryClient={new QueryClient()}
			>
				<TelemetrySetting />
			</electronTrpc.Provider>,
		);
		const toggle = view.container.querySelector(
			"#telemetry",
		) as HTMLButtonElement;
		await waitFor(() => expect(toggle.disabled).toBe(false));

		await act(async () => {
			fireEvent.click(toggle);
		});

		await waitFor(() =>
			expect(toggle.getAttribute("aria-checked")).toBe("true"),
		);
		expect(isTelemetryEnabled()).toBe(true);
	});
});
