import { afterEach, describe, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { HostDb } from "../db";
import { type ChatV3Mount, registerChatV3Routes } from "./mount";

let closeServer: (() => void) | null = null;

afterEach(() => {
	closeServer?.();
	closeServer = null;
});

describe("chat-v3 stream route", () => {
	test("closes the socket when the session stream cannot open", async () => {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		const mount = {
			runtime: () => {
				throw new Error("chat.db unavailable");
			},
		} as unknown as ChatV3Mount;
		registerChatV3Routes({
			app,
			db: {} as HostDb,
			mount,
			upgradeWebSocket,
		});
		const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
		injectWebSocket(server);
		closeServer = () => server.close();
		await new Promise<void>((resolve) => server.once("listening", resolve));
		const { port } = server.address() as AddressInfo;

		const closed = new Promise<void>((resolve) => {
			const socket = new WebSocket(
				`ws://127.0.0.1:${port}/chat-v3/sessions/session-1/stream`,
			);
			socket.onclose = () => resolve();
		});

		await closed;
	});
});
