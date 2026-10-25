import { expect, test } from "bun:test";
import { hostPresence } from "./hostPresence";

const status = (
	state: "connecting" | "open" | "reconnecting" | "closed",
	probe: number | null = null,
) => ({ state, since: 0, probe: probe === null ? null : { status: probe } });

test("a host whose first connection has not resolved is unknown, not offline", () => {
	expect(hostPresence(undefined)).toEqual({
		isOnline: false,
		isConnecting: true,
	});
	expect(hostPresence(status("connecting"))).toEqual({
		isOnline: false,
		isConnecting: true,
	});
	expect(hostPresence(status("connecting", 200))).toEqual({
		isOnline: false,
		isConnecting: true,
	});
});

test("the relay saying the host is not connected means offline while still connecting", () => {
	expect(hostPresence(status("connecting", 503))).toEqual({
		isOnline: false,
		isConnecting: false,
	});
	expect(hostPresence(status("connecting", 403))).toEqual({
		isOnline: false,
		isConnecting: false,
	});
});

test("open is online; a failed connection is offline", () => {
	expect(hostPresence(status("open"))).toEqual({
		isOnline: true,
		isConnecting: false,
	});
	expect(hostPresence(status("reconnecting"))).toEqual({
		isOnline: false,
		isConnecting: false,
	});
	expect(hostPresence(status("closed"))).toEqual({
		isOnline: false,
		isConnecting: false,
	});
});
