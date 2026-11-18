import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { stub } from "../../test/stub";
import { logControl } from "./control-log";

describe("logControl", () => {
	const logged: unknown[] = [];
	stub(Sentry.logger, {
		warn: (...args: unknown[]) => logged.push(args),
	});

	test("writes the event as the body with the control source and ids", () => {
		logControl(
			"meter.cap_reached",
			{ cloudWorkspaceId: "ws_1", organizationId: "org_1", bootId: "boot_1" },
			{ stop_in_ms: 300_000 },
			"warn",
		);
		expect(logged).toEqual([
			[
				"meter.cap_reached",
				{
					"log.source": "control",
					"cloud_workspace.id": "ws_1",
					"organization.id": "org_1",
					"boot.id": "boot_1",
					stop_in_ms: 300_000,
				},
			],
		]);
	});
});
