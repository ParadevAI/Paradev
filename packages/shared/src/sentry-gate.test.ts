import { describe, expect, test } from "bun:test";
import { gateSentryTransport } from "./sentry-gate";

describe("gateSentryTransport", () => {
	test("drops every envelope, sessions included, while the gate is closed", async () => {
		const sent: string[] = [];
		let enabled = true;
		const transport = gateSentryTransport(
			() => ({
				send: async (envelope: string) => {
					sent.push(envelope);
					return {};
				},
				flush: async () => true,
			}),
			() => enabled,
		)({});

		await transport.send("event-on");
		enabled = false;
		await transport.send("event-off");
		await transport.send("session-off");
		enabled = true;
		await transport.send("session-on");

		expect(sent).toEqual(["event-on", "session-on"]);
	});
});
