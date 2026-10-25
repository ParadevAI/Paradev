import { expect, test } from "bun:test";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { resolveRemoteHostPresence } from "./resolveRemoteHostPresence";

const host = (isOnline: boolean, isConnecting: boolean) => ({
	id: "box",
	isOnline,
	isConnecting,
});
const resolve = (
	selectedHostId: string | null,
	hosts = [host(true, false)],
	hostsSettled = true,
) =>
	resolveRemoteHostPresence({
		selectedHostId,
		localHostId: "local",
		hosts,
		hostsSettled,
	});

test("the local device and cloud are not remote hosts", () => {
	expect(resolve(null)).toBeNull();
	expect(resolve("local")).toBeNull();
	expect(resolve(CLOUD_HOST_ID)).toBeNull();
});

test("a listed host is online, offline, or still connecting", () => {
	expect(resolve("box", [host(true, false)])).toBe("online");
	expect(resolve("box", [host(false, false)])).toBe("offline");
	expect(resolve("box", [host(false, true)])).toBe("connecting");
});

test("a host missing from the list waits until the list loads, then is unknown", () => {
	expect(resolve("box", [], false)).toBe("connecting");
	expect(resolve("box", [], true)).toBe("unknown");
});
