import { afterEach, describe, expect, test } from "bun:test";
import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { repliesOverHttp, replyExtension } from "./reply-tool.ts";

function replyTool() {
	const posted: string[] = [];
	const quoted: (string | undefined)[] = [];
	let tool: ToolDefinition | undefined;
	replyExtension(async (text, replyTo) => {
		posted.push(text);
		quoted.push(replyTo);
	})({
		registerTool: (t: ToolDefinition) => void (tool = t),
	} as unknown as ExtensionAPI);
	const run = (text: string, replyTo?: string) =>
		tool!.execute(
			"call-1",
			{ text, replyTo } as never,
			undefined,
			undefined,
			{} as never,
		);
	return { tool: tool!, run, posted, quoted };
}

describe("the reply tool", () => {
	test("asks for a short reply, a sentence or two", () => {
		expect(replyTool().tool.description).toContain("about 60 words");
	});

	test("quotes the message it names with replyTo, and none without it", async () => {
		const { run, quoted } = replyTool();
		await run("Palolem.", " #1a2b3c4d ");
		await run("Also this.");
		expect(quoted).toEqual(["#1a2b3c4d", undefined]);
	});

	test("posts the trimmed text and tells the model it's done, so it doesn't say it again", async () => {
		const { tool, run, posted } = replyTool();
		expect(tool.name).toBe("reply");
		expect(
			((await run("  Booked for four at 8.\n")).content[0] as { text: string })
				.text,
		).toMatch(/^Posted: that's your reply/);
		expect(posted).toEqual(["Booked for four at 8."]);
	});

	test("refuses an empty reply: staying quiet is not calling it", async () => {
		const { run, posted } = replyTool();
		await expect(run("  ")).rejects.toThrow("don't call reply");
		expect(posted).toEqual([]);
	});
});

describe("replies over HTTP", () => {
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("post to the API's reply route naming the chat, with no credential, and surface the API's refusal", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		let status = 201;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response(
				JSON.stringify(
					status === 201 ? {} : { message: "This is a task turn" },
				),
				{ status },
			);
		}) as unknown as typeof fetch;
		const post = repliesOverHttp("http://api.test/", "g1");
		await post("hi");
		await post("yes", "#1a2b3c4d");
		expect(calls.at(-1)!.init.body).toBe(
			'{"text":"yes","replyTo":"#1a2b3c4d"}',
		);
		calls.pop();
		expect(calls).toEqual([
			{
				url: "http://api.test/cli/reply",
				init: {
					method: "POST",
					headers: { "x-dev-chat": "g1", "content-type": "application/json" },
					body: '{"text":"hi"}',
				},
			},
		]);
		status = 409;
		await expect(post("hi")).rejects.toThrow("task turn");
	});
});
