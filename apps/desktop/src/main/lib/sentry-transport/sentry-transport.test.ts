import { afterEach, describe, expect, test } from "bun:test";
import { telemetryGatedTransport } from "./sentry-transport";

const original = process.env.DO_NOT_TRACK;

afterEach(() => {
	if (original === undefined) delete process.env.DO_NOT_TRACK;
	else process.env.DO_NOT_TRACK = original;
});

describe("telemetryGatedTransport", () => {
	test("reads the setting for every envelope, so sessions stop once it is off", async () => {
		const sent: string[] = [];
		const transport = telemetryGatedTransport(() => ({
			send: async (envelope: string) => {
				sent.push(envelope);
				return {};
			},
			flush: async () => true,
		}))({});

		delete process.env.DO_NOT_TRACK;
		await transport.send("session-ok");
		process.env.DO_NOT_TRACK = "1";
		await transport.send("session-exited");

		expect(sent).toEqual(["session-ok"]);
	});
});
