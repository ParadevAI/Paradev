import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { POSTHOG_PRIVACY_CONFIG } from "@superset/shared/posthog-privacy";
import type { CaptureResult } from "posthog-js";
import posthogFull from "posthog-js/dist/module.full.no-external";
import { createPostHogConfig } from "./posthog";
import { setTelemetryEnabled } from "./telemetry";

type BeforeSend = (event: CaptureResult | null) => CaptureResult | null;

function runBeforeSend(
	config: ReturnType<typeof createPostHogConfig>,
	event: CaptureResult,
): CaptureResult | null {
	let current: CaptureResult | null = event;
	for (const step of config.before_send as BeforeSend[]) {
		current = step(current);
		if (!current) return null;
	}
	return current;
}

function snapshotEvent(): CaptureResult {
	return {
		uuid: "1",
		event: "$snapshot",
		properties: {
			$snapshot_data: [
				{ type: 6, data: { plugin: "rrweb/console@1" } },
				{
					type: 2,
					data: { node: { tagName: "a", attributes: { title: "secret" } } },
				},
			],
		},
	} as CaptureResult;
}

function exceptionEvent(): CaptureResult {
	return {
		uuid: "2",
		event: "$exception",
		properties: {
			$exception_list: [{ value: "failed at /Users/alice/project" }],
		},
	} as CaptureResult;
}

afterEach(() => setTelemetryEnabled(true));

describe("createPostHogConfig", () => {
	test("with usage data on, carries the recording masking options", () => {
		const config = createPostHogConfig(true);

		expect(config).toMatchObject(POSTHOG_PRIVACY_CONFIG);
		expect(config.opt_out_capturing_by_default).toBe(false);
		expect(config.disable_session_recording).toBe(false);
		expect(config.advanced_disable_flags).toBeUndefined();

		const snapshot = runBeforeSend(config, snapshotEvent());
		expect(snapshot?.properties.$snapshot_data).toEqual([
			{
				type: 2,
				data: { node: { tagName: "a", attributes: { title: "***" } } },
			},
		]);
		const exception = runBeforeSend(config, exceptionEvent());
		expect(exception?.properties.$exception_list).toEqual([
			{ value: "failed at ~/project" },
		]);
	});

	test("with usage data off, drops every event", () => {
		setTelemetryEnabled(false);
		const config = createPostHogConfig(false);

		expect(config.opt_out_capturing_by_default).toBe(true);
		expect(config.disable_session_recording).toBe(true);
		expect(config.capture_exceptions).toBe(false);
		expect(config.advanced_disable_flags).toBe(true);
		expect(runBeforeSend(config, snapshotEvent())).toBeNull();
		expect(runBeforeSend(config, exceptionEvent())).toBeNull();
	});

	test("turning usage data off after init drops events", () => {
		const config = createPostHogConfig(true);
		setTelemetryEnabled(false);

		expect(runBeforeSend(config, snapshotEvent())).toBeNull();
		expect(runBeforeSend(config, exceptionEvent())).toBeNull();
	});

	test("a PostHog instance started with usage data off sends nothing", () => {
		setTelemetryEnabled(false);
		const fetchSpy = spyOn(globalThis, "fetch");
		const captured: string[] = [];
		const instance = posthogFull.init(
			"phc_test",
			{
				...createPostHogConfig(false),
				api_host: "http://127.0.0.1:9",
				persistence: "memory",
			},
			"usage-data-off",
		);
		instance?.on("eventCaptured", (event) => captured.push(event.event));

		instance?.capture("test_event");
		instance?.captureException(new Error("failed"));

		expect(instance?.has_opted_out_capturing()).toBe(true);
		expect(captured).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
