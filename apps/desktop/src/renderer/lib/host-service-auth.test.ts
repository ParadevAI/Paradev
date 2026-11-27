import { afterEach, expect, test } from "bun:test";
import { TELEMETRY_HEADER } from "@superset/shared/constants";
import { setJwt } from "./auth-client";
import {
	getHostServiceHeaders,
	removeHostServiceSecret,
	resolveHostServiceHeaders,
	setHostServiceSecret,
} from "./host-service-auth";
import { setTelemetryEnabled } from "./telemetry";

const RELAY_HOST_URL = "https://relay.example/hosts/org:machine";
const LOCAL_HOST_URL = "http://127.0.0.1:4879";

afterEach(() => {
	setTelemetryEnabled(true);
	setJwt(null);
	removeHostServiceSecret(LOCAL_HOST_URL);
});

test("a relay call sends the token the refresh produced", async () => {
	setJwt("stale");

	const headers = await resolveHostServiceHeaders(
		RELAY_HOST_URL,
		async () => {
			setJwt("fresh");
		},
		() => true,
	);

	expect(headers.Authorization).toBe("Bearer fresh");
});

test("a host reached with its own secret does not wait on a refresh", async () => {
	setHostServiceSecret(LOCAL_HOST_URL, "secret");
	let refreshed = false;

	const headers = await resolveHostServiceHeaders(LOCAL_HOST_URL, async () => {
		refreshed = true;
	});

	expect(refreshed).toBe(false);
	expect(headers.Authorization).toBe("Bearer secret");
});

test("a relay call with a usable token does not wait on a refresh", async () => {
	setJwt("usable");
	let refreshed = false;

	const headers = await resolveHostServiceHeaders(
		RELAY_HOST_URL,
		async () => {
			refreshed = true;
		},
		() => false,
	);

	expect(refreshed).toBe(false);
	expect(headers.Authorization).toBe("Bearer usable");
});

test("a relay call tells the remote host that usage data is off", () => {
	setJwt("token");
	setHostServiceSecret(LOCAL_HOST_URL, "secret");
	setTelemetryEnabled(false);

	expect(getHostServiceHeaders(RELAY_HOST_URL)[TELEMETRY_HEADER]).toBe("off");
	expect(
		getHostServiceHeaders(LOCAL_HOST_URL)[TELEMETRY_HEADER],
	).toBeUndefined();
});
