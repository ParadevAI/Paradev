import { afterEach, describe, expect, test } from "bun:test";
import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	type EventReport,
	reportEventsExtension,
	reportsOverHttp,
} from "./report-events-tool.ts";

function reportTool() {
	const reports: EventReport[][] = [];
	let tool: ToolDefinition | undefined;
	reportEventsExtension(async (events) => {
		reports.push(events);
		return events.length;
	})({
		registerTool: (t: ToolDefinition) => void (tool = t),
	} as unknown as ExtensionAPI);
	const run = (events: EventReport[]) =>
		tool!.execute(
			"call-1",
			{ events } as never,
			undefined,
			undefined,
			{} as never,
		);
	return { tool: tool!, run, reports };
}

describe("the report_events tool", () => {
	test("reports every event with its action and trimmed note, then asks for the summary line", async () => {
		const { tool, run, reports } = reportTool();
		expect(tool.name).toBe("report_events");
		const answer = await run([
			{ event: 1, action: "told", note: " Prod is down \n" },
			{ event: "3f1c…", action: "skipped", note: "Newsletter" },
		]);
		expect((answer.content[0] as { text: string }).text).toBe(
			"Reported 2 events. End with a one-line summary of the batch.",
		);
		expect(reports).toEqual([
			[
				{ event: 1, action: "told", note: "Prod is down" },
				{ event: "3f1c…", action: "skipped", note: "Newsletter" },
			],
		]);
	});
});

describe("reports over HTTP", () => {
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("post to the API naming the chat, and surface its refusal", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		let status = 200;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response(
				JSON.stringify(
					status === 200
						? { reported: 1 }
						: { message: "No event 4 in this batch" },
				),
				{ status },
			);
		}) as unknown as typeof fetch;
		const report = reportsOverHttp("http://api.test/", "g1");
		expect(
			await report([{ event: 1, action: "acted", note: "Drafted a reply" }]),
		).toBe(1);
		expect(calls).toEqual([
			{
				url: "http://api.test/cli/triggers/events/report",
				init: {
					method: "POST",
					headers: { "x-dev-chat": "g1", "content-type": "application/json" },
					body: '{"events":[{"event":1,"action":"acted","note":"Drafted a reply"}]}',
				},
			},
		]);
		status = 400;
		await expect(
			report([{ event: 4, action: "told", note: "" }]),
		).rejects.toThrow("No event 4");
	});
});
