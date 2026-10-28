import { expect, test } from "bun:test";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { connectedHostUrls } from "./connectedHostUrls";

const relayUrl = "https://relay.test";
const relayed = (machineId: string) =>
	`${relayUrl}/hosts/${buildHostRoutingKey("org-1", machineId)}`;

test("the local host is reached directly and online remote hosts through the relay", () => {
	expect(
		connectedHostUrls({
			activeHostUrl: "http://127.0.0.1:4000",
			machineId: "local",
			relayUrl,
			hosts: [
				{ organizationId: "org-1", machineId: "local", isOnline: false },
				{ organizationId: "org-1", machineId: "remote-a", isOnline: true },
				{ organizationId: "org-1", machineId: "remote-b", isOnline: false },
			],
		}),
	).toEqual(["http://127.0.0.1:4000", relayed("remote-a")]);
});

test("online remote hosts are still reached while the local host is down", () => {
	expect(
		connectedHostUrls({
			activeHostUrl: null,
			machineId: "local",
			relayUrl,
			hosts: [
				{ organizationId: "org-1", machineId: "local", isOnline: true },
				{ organizationId: "org-1", machineId: "remote-a", isOnline: true },
			],
		}),
	).toEqual([relayed("remote-a")]);
});
