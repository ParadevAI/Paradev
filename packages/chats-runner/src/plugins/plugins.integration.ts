import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hub, type TurnContext } from "../hub/hub.ts";
import { openPiSession } from "../pi/pi-session.ts";
import { pluginsPrompt, type TurnPlugin } from "./plugins.ts";

const LINEAR: TurnPlugin = {
	name: "composio-linear",
	displayName: "Linear",
	description: "Act in the owner's Linear through Composio.",
	accounts: ["Superset workspace"],
};

/** Stands in for the API's credential proxy: a tiny MCP server that records the chat and any Authorization of every request. */
let api: ReturnType<typeof Bun.serve>;
const seen: {
	path: string;
	chat: string | null;
	auth: string | null;
	method: string;
}[] = [];
let dir: string;
let fakeBin: string;

beforeAll(() => {
	api = Bun.serve({
		port: 0,
		async fetch(req) {
			const path = new URL(req.url).pathname;
			if (req.method !== "POST") return new Response(null, { status: 405 });
			const message = (await req.json()) as {
				id?: number;
				method: string;
				params?: { arguments?: unknown };
			};
			seen.push({
				path,
				chat: req.headers.get("x-dev-chat"),
				auth: req.headers.get("authorization"),
				method: message.method,
			});
			if (message.id === undefined) return new Response(null, { status: 202 });
			const answer = (result: unknown) =>
				Response.json(
					{ jsonrpc: "2.0", id: message.id, result },
					{ headers: { "mcp-session-id": "s-1" } },
				);
			if (message.method === "initialize")
				return answer({
					protocolVersion: "2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: "proxy", version: "1" },
				});
			if (message.method === "tools/list")
				return answer({
					tools: [
						{
							name: "COMPOSIO_MULTI_EXECUTE_TOOL",
							description: "Runs tools",
							inputSchema: {
								type: "object",
								properties: { tools: { type: "array" } },
							},
						},
					],
				});
			if (message.method === "tools/call")
				return answer({
					content: [
						{
							type: "text",
							text: `ran ${JSON.stringify(message.params?.arguments)}`,
						},
					],
				});
			return answer({});
		},
	});
	dir = mkdtempSync(join(tmpdir(), "runner-plugins-"));
	fakeBin = join(dir, "bin");
	mkdirSync(fakeBin);
	writeFileSync(join(fakeBin, "dev"), '#!/bin/sh\necho "Sent. $*"\n');
	chmodSync(join(fakeBin, "dev"), 0o755);
});

afterAll(() => {
	api.stop(true);
	rmSync(dir, { recursive: true, force: true });
});

const turn = (plugins: TurnPlugin[]): TurnContext => ({
	env: { PATH: `${fakeBin}:${process.env.PATH}` },
	plugins,
});

/** What the server writes to `/agent/mcp.json` for these plugin entries. */
const writeMcp = (
	agentDir: string,
	entries: Record<string, { description: string }>,
) =>
	writeFileSync(
		join(agentDir, "mcp.json"),
		JSON.stringify({
			mcpServers: Object.fromEntries(
				Object.entries(entries).map(([name, e]) => [
					name,
					{
						url: `http://127.0.0.1:${api.port}/plugins/${name}/mcp`,
						exposure: "deferred",
						...e,
					},
				]),
			),
		}),
	);

describe("connected apps in a box", () => {
	test("mcp.json's app entries are the proxy's servers, synced every turn; requests name the chat and carry no credential", async () => {
		const agentDir = join(dir, "agent");
		mkdirSync(agentDir);
		writeMcp(agentDir, {
			"composio-linear": { description: "Linear: comments." },
		});
		const hub = new Hub((sessionId) =>
			openPiSession({
				agentDir,
				sessionId,
				apiUrl: `http://127.0.0.1:${api.port}`,
				faux: true,
			}),
		);
		const session = await hub.get("group-1");

		const first = await session.prompt("use linear", turn([LINEAR]));
		expect(first.stopReason).toBe("end_turn");
		const calls = seen.filter((s) => s.method === "tools/call");
		expect(calls).toEqual([
			{
				path: "/plugins/composio-linear/mcp",
				chat: "group-1",
				auth: null,
				method: "tools/call",
			},
		]);

		// The connection stays open across turns while the entry is unchanged.
		seen.length = 0;
		await session.prompt("use linear", turn([LINEAR]));
		expect(seen.map((s) => s.method)).toEqual(["tools/call"]);

		// The owner added an account: the entry changed, so the server is reconnected and its tools listed again.
		seen.length = 0;
		writeMcp(agentDir, {
			"composio-linear": {
				description: "Linear: comments. Connected accounts: Home, Work.",
			},
		});
		await session.prompt("use linear", turn([LINEAR]));
		expect(seen.map((s) => s.method)).toEqual([
			"initialize",
			"notifications/initialized",
			"tools/list",
			"tools/call",
		]);

		// A file that doesn't parse keeps the servers the session has.
		seen.length = 0;
		writeFileSync(join(agentDir, "mcp.json"), '{"mcpServers": {"composio-li');
		await session.prompt("use linear", turn([LINEAR]));
		expect(seen.map((s) => s.method)).toEqual(["tools/call"]);

		// Revoked by its owner: the entry is gone, so the tool is gone and nothing reaches the proxy.
		seen.length = 0;
		writeMcp(agentDir, {});
		await session.prompt("use linear", turn([]));
		expect(seen).toEqual([]);
	}, 30_000);

	test("a group's Dev (no connected apps) asks the Dev its prompt lists with Linear", async () => {
		const agentDir = join(dir, "group-dev");
		mkdirSync(agentDir);
		const replies: string[] = [];
		const hub = new Hub((sessionId) =>
			openPiSession({
				agentDir,
				sessionId,
				apiUrl: `http://127.0.0.1:${api.port}`,
				faux: true,
				replies: async (text) => void replies.push(text),
			}),
		);
		const session = await hub.get("group-2");
		const commands: string[] = [];
		session.attach((u) => {
			if (
				u.sessionUpdate === "tool_call" &&
				typeof (u.rawInput as { command?: string })?.command === "string"
			)
				commands.push((u.rawInput as { command: string }).command);
		});
		const juniper = "11111111-2222-3333-4444-555555555555";
		const prompt = `## New message\nChat: the group "Goa trip"\nFrom: alice\n\nuse linear`;
		const roster = `alice · person · u1\n\nYou have no connected apps. Devs here with connected apps (to use one, \`dev ask\` that Dev):\n- Juniper (alice's) · ${juniper} · Gmail, Linear`;
		await session.prompt(prompt, { ...turn([]), chat: { recent: [], roster } });
		expect(commands).toEqual([
			`dev ask ${juniper} "use linear and tell me what it says"`,
		]);
		// A message's turn: what it says goes out with `reply`.
		expect(replies).toHaveLength(1);
		expect(replies[0]).toStartWith("Juniper (alice's) used Linear: Sent. ask");
	}, 30_000);

	test("the system prompt names no app when the Dev has none", () => {
		expect(pluginsPrompt([])).toEqual([]);
	});

	test("each connected app is listed with its tools and accounts, so the model can tell several apart", () => {
		const gmail: TurnPlugin = {
			name: "composio-gmail",
			displayName: "Gmail",
			description:
				"Act in the owner's Gmail through Composio, passing the account you mean as each tool's `account` (its id).",
			accounts: ["harshith@superset.sh (ca_1)", "me@poozle.dev (ca_2)"],
		};
		expect(pluginsPrompt([gmail, LINEAR])).toEqual([
			"## Your connected apps\n\n" +
				"- Gmail (`composio-gmail`, tools `mcp__composio_gmail__*`): Act in the owner's Gmail through Composio, passing the account you mean as each tool's `account` (its id).\n" +
				"  - Connected accounts: harshith@superset.sh (ca_1), me@poozle.dev (ca_2)\n" +
				"- Linear (`composio-linear`, tools `mcp__composio_linear__*`): Act in the owner's Linear through Composio.\n" +
				"  - Connected accounts: Superset workspace",
		]);
	});
});
