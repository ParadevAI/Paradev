import { afterEach, describe, expect, test } from "bun:test";
import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { updateExtension, updatesOverHttp } from "./update-tool.ts";

function updateTool() {
	const posted: string[] = [];
	const quoted: (string | undefined)[] = [];
	let tool: ToolDefinition | undefined;
	updateExtension(async (text, replyTo) => {
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

describe("the send_update tool", () => {
	test("asks for a line or two", () => {
		expect(updateTool().tool.description).toContain("a line or two");
	});

	test("quotes the message it names with replyTo, and none without it", async () => {
		const { run, quoted } = updateTool();
		await run("Palolem.", " #1a2b3c4d ");
		await run("Also this.");
		expect(quoted).toEqual(["#1a2b3c4d", undefined]);
	});

	test("posts the trimmed text and tells the model it went out, so its reply doesn't repeat it", async () => {
		const { tool, run, posted } = updateTool();
		expect(tool.name).toBe("send_update");
		expect(
			(
				(await run("  On it: checking flights.\n")).content[0] as {
					text: string;
				}
			).text,
		).toMatch(
			/^Posted: people in the chat can see it now\. Don't repeat it in your reply/,
		);
		expect(posted).toEqual(["On it: checking flights."]);
	});

	test("refuses an empty update", async () => {
		const { run, posted } = updateTool();
		await expect(run("  ")).rejects.toThrow("empty");
		expect(posted).toEqual([]);
	});
});

describe("updates over HTTP", () => {
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("post to the API naming the chat, with no credential, and surface the API's refusal", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		let status = 201;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response(
				JSON.stringify(
					status === 201
						? {}
						: { message: "This Dev is no longer in the group" },
				),
				{ status },
			);
		}) as unknown as typeof fetch;
		const post = updatesOverHttp("http://api.test/", "g1");
		await post("hi");
		await post("yes", "#1a2b3c4d");
		expect(calls.at(-1)!.init.body).toBe(
			'{"text":"yes","replyTo":"#1a2b3c4d"}',
		);
		calls.pop();
		expect(calls).toEqual([
			{
				url: "http://api.test/cli/messages",
				init: {
					method: "POST",
					headers: { "x-dev-chat": "g1", "content-type": "application/json" },
					body: '{"text":"hi"}',
				},
			},
		]);
		status = 403;
		await expect(post("hi")).rejects.toThrow("no longer in the group");
	});
});
