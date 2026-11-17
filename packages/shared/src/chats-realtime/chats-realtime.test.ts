import { describe, expect, test } from "bun:test";
import {
	chatsGroupChannel,
	chatsTicketFromProtocols,
	chatsUserChannel,
	isChatsChannel,
	signChatsRealtimeTicket,
	verifyChatsRealtimeTicket,
} from "./chats-realtime";

const SECRET = "s".repeat(32);
const USER = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const NOW = 1_800_000_000_000;
const grant = {
	userId: USER,
	channels: [chatsUserChannel(USER), chatsGroupChannel(GROUP)],
	exp: NOW / 1000 + 600,
};

describe("chats realtime tickets", () => {
	test("a ticket verifies with its secret and gives back its grant", async () => {
		const ticket = await signChatsRealtimeTicket(SECRET, grant);
		expect(await verifyChatsRealtimeTicket(SECRET, ticket, NOW)).toEqual(grant);
	});

	test("a wrong secret, an expired ticket and a bad channel are refused", async () => {
		const ticket = await signChatsRealtimeTicket(SECRET, grant);
		expect(
			await verifyChatsRealtimeTicket("x".repeat(32), ticket, NOW),
		).toBeNull();
		expect(
			await verifyChatsRealtimeTicket(SECRET, ticket, NOW + 601_000),
		).toBeNull();
		const odd = await signChatsRealtimeTicket(SECRET, {
			...grant,
			channels: ["org:everything"],
		});
		expect(await verifyChatsRealtimeTicket(SECRET, odd, NOW)).toBeNull();
	});

	test("only user and group channels with a uuid are channels", () => {
		expect(isChatsChannel(chatsGroupChannel(GROUP))).toBe(true);
		expect(isChatsChannel("group:nope")).toBe(false);
		expect(isChatsChannel(`page:${GROUP}`)).toBe(false);
	});

	test("the ticket is the subprotocol offered beside the protocol's name", () => {
		expect(chatsTicketFromProtocols("chats-realtime, abc.def")).toBe("abc.def");
		expect(chatsTicketFromProtocols("abc.def")).toBeNull();
		expect(chatsTicketFromProtocols(null)).toBeNull();
	});
});
