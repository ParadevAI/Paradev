import { describe, expect, test } from "bun:test";
import {
	createPageToolRunner,
	type PageToolAnswer,
	type PageToolHost,
} from "../runPageToolCall";
import { type PageToolHostBinding, pageScopedHost } from "./pageScopedHost";

const REQUEST = { plugin: "neon", tool: "run_sql", args: {} };

function recordingHost(name: string, log: string[]): PageToolHost {
	return {
		callTool: async () => {
			log.push(`call:${name}`);
			return { status: "needs_grant", pluginLabel: "Neon" };
		},
		grant: async () => {
			log.push(`grant:${name}`);
		},
		install: async () => {
			log.push(`install:${name}`);
		},
		openUrl: () => {
			log.push(`open:${name}`);
		},
	};
}

describe("pageScopedHost", () => {
	test("a call started on one page never reaches the next page's host", async () => {
		const log: string[] = [];
		let binding: PageToolHostBinding = {
			host: recordingHost("a", log),
			pageId: "a",
		};
		let allow: (answer: PageToolAnswer) => void = () => {};
		const run = createPageToolRunner(
			pageScopedHost(() => binding, "a"),
			() =>
				new Promise((resolve) => {
					allow = resolve;
				}),
		);
		const pending = run(REQUEST);
		await new Promise((resolve) => setTimeout(resolve, 0));
		binding = { host: recordingHost("b", log), pageId: "b" };
		allow({ allow: true });
		expect(await pending).toMatchObject({ ok: false, code: "unavailable" });
		expect(log).toEqual(["call:a"]);
	});

	test("a decline on one page does not deny the plugin on another", async () => {
		const log: string[] = [];
		const binding = { host: recordingHost("a", log), pageId: "a" };
		const declineA = createPageToolRunner(
			pageScopedHost(() => binding, "a"),
			async () => ({ allow: false }),
		);
		expect(await declineA(REQUEST)).toMatchObject({ code: "denied" });
		let asked = 0;
		const runB = createPageToolRunner(
			pageScopedHost(() => binding, "a"),
			async () => {
				asked++;
				return { allow: false };
			},
		);
		await runB(REQUEST);
		expect(asked).toBe(1);
	});
});
