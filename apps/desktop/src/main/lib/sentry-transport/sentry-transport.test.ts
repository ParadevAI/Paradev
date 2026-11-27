import { afterEach, describe, expect, test } from "bun:test";
import {
	telemetryGatedOfflineTransport,
	telemetryGatedTransport,
} from "./sentry-transport";

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

describe("telemetryGatedOfflineTransport", () => {
	test("an envelope queued while it was on is not sent by a retry after it is turned off", async () => {
		const sent: string[] = [];
		let online = false;
		const makeBase = (_options: object) => ({
			send: async (envelope: string) => {
				if (!online) throw new Error("offline");
				sent.push(envelope);
				return {};
			},
			flush: async () => true,
		});
		const queue: string[] = [];
		const makeOffline =
			(makeBaseTransport: typeof makeBase) => (options: object) => {
				const base = makeBaseTransport(options);
				return {
					send: async (envelope: string) => {
						try {
							return await base.send(envelope);
						} catch {
							queue.push(envelope);
							return {};
						}
					},
					retry: async () => {
						const envelope = queue.shift();
						if (envelope) await base.send(envelope);
					},
				};
			};
		const transport = telemetryGatedOfflineTransport(makeOffline, makeBase)({});

		delete process.env.DO_NOT_TRACK;
		await transport.send("crash");
		process.env.DO_NOT_TRACK = "1";
		online = true;
		await transport.retry();

		expect(queue).toEqual([]);
		expect(sent).toEqual([]);
	});
});
