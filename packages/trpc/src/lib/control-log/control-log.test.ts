import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { stub } from "../../../test/stub";
import {
	CONTROL_EVENT_LEVELS,
	type ControlRecord,
	captureControlException,
	controlLog,
	controlRecord,
	errorClass,
	logControl,
	logStepFailed,
	sentryControlCapture,
	sentryControlSink,
} from "./control-log";

const SCOPE = { cloudWorkspaceId: "ws_1", organizationId: "org_1" };

describe("controlRecord", () => {
	test("carries the source and ids, the event as body, and its level", () => {
		expect(
			controlRecord(
				"wake.completed",
				{ ...SCOPE, bootId: "boot_1" },
				{ ms: 812, "box.resumed": true, "box.rebooted": false },
			),
		).toEqual({
			level: "info",
			body: "wake.completed",
			attributes: {
				"log.source": "control",
				"cloud_workspace.id": "ws_1",
				"organization.id": "org_1",
				"boot.id": "boot_1",
				ms: 812,
				"box.resumed": true,
				"box.rebooted": false,
			},
		});
	});

	test("leaves out a missing boot and unset fields", () => {
		const { attributes } = controlRecord(
			"workspace.created",
			{ ...SCOPE, bootId: null },
			{
				"machine.size": "standard",
				"repositories.count": 1,
				"launch.agent": undefined,
			},
		);
		expect(Object.keys(attributes).sort()).toEqual([
			"cloud_workspace.id",
			"log.source",
			"machine.size",
			"organization.id",
			"repositories.count",
		]);
	});

	test("failures are warnings or errors", () => {
		for (const [event, level] of Object.entries(CONTROL_EVENT_LEVELS)) {
			if (event.endsWith(".failed") || event.endsWith("_failed")) {
				expect([event, level]).not.toEqual([event, "info"]);
			}
		}
	});

	test("a failure Autumn refused is a warning, any other an error", () => {
		const failed = (refused: boolean) =>
			controlRecord("workspace.failed", SCOPE, {
				"failure.site": "provision",
				"error.class": "TRPCError",
				"status.changed": true,
				"failure.refused": refused,
			}).level;
		expect(failed(true)).toBe("warn");
		expect(failed(false)).toBe("error");
	});
});

describe("errorClass", () => {
	test("is the class name, never the message", () => {
		expect(errorClass(new RangeError("sk_live_123"))).toBe("RangeError");
		expect(errorClass("a message from the box")).toBe("string");
		expect(errorClass(null)).toBe("null");
	});
});

describe("logControl", () => {
	const sent: Array<[ControlRecord, unknown]> = [];
	let failing = false;
	stub(controlLog, {
		sink: (record: ControlRecord, error?: unknown) => {
			if (failing) throw new Error("sink down");
			sent.push([record, error]);
		},
	});

	test("hands the error to the sink apart from the record", () => {
		const error = new Error("clone https://x-access-token:ghs_abc@github.com");
		logStepFailed("chat_moves.fail", SCOPE, error);
		const [record, passed] = sent.at(-1) as [ControlRecord, unknown];
		expect(record.level).toBe("warn");
		expect(record.attributes).toMatchObject({
			step: "chat_moves.fail",
			"error.class": "Error",
		});
		expect(JSON.stringify(record)).not.toContain("ghs_abc");
		expect(passed).toBe(error);
	});

	test("never throws when the sink does", () => {
		failing = true;
		expect(() => logControl("wake.started", SCOPE, {})).not.toThrow();
		failing = false;
	});
});

describe("captureControlException", () => {
	const captured: unknown[][] = [];
	stub(controlLog, {
		capture: (...args: unknown[]) => {
			captured.push(args);
		},
	});

	test("passes the scope for tags", () => {
		const error = new Error("x");
		captureControlException(error, { ...SCOPE, bootId: "boot_1" });
		expect(captured).toEqual([
			[error, { ...SCOPE, bootId: "boot_1" }, undefined],
		]);
	});
});

describe("the Sentry sink", () => {
	const logs: unknown[][] = [];
	const exceptions: unknown[][] = [];
	stub(Sentry.logger, {
		error: (...args: unknown[]) => {
			logs.push(args);
		},
	});
	stub(Sentry, {
		captureException: (...args: unknown[]) => {
			exceptions.push(args);
			return "event_1";
		},
	});
	stub(console, { error: () => {} });

	test("sends the body and attributes to Sentry Logs at the record's level", () => {
		sentryControlSink(
			controlRecord("workspace.failed", SCOPE, {
				"failure.site": "queue",
				"error.class": "Error",
				"status.changed": true,
			}),
			new Error("not sent"),
		);
		expect(logs).toEqual([
			[
				"workspace.failed",
				{
					"log.source": "control",
					"cloud_workspace.id": "ws_1",
					"organization.id": "org_1",
					"failure.site": "queue",
					"error.class": "Error",
					"status.changed": true,
				},
			],
		]);
	});

	test("tags an exception with the ids", () => {
		const error = new Error("x");
		sentryControlCapture(
			error,
			{ ...SCOPE, bootId: "boot_1" },
			{ failureSite: "queue" },
		);
		expect(exceptions).toEqual([
			[
				error,
				{
					tags: {
						"cloud_workspace.id": "ws_1",
						"organization.id": "org_1",
						"boot.id": "boot_1",
					},
					extra: { failureSite: "queue" },
				},
			],
		]);
	});
});
