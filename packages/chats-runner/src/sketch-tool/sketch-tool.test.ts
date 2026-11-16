import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	type SketchRequest,
	type SketchResult,
	sketchExtension,
	sketchesOverHttp,
} from "./sketch-tool.ts";

const PICTURE = { type: "image/png", data: "iVBORw0K" };
const posted = (overrides: Partial<SketchResult> = {}): SketchResult => ({
	app: { id: "s1", name: "Trip budget", saved: false },
	picture: PICTURE,
	errors: [],
	...overrides,
});

function sketchTool(result: SketchResult = posted()) {
	const agentDir = mkdtempSync(join(tmpdir(), "sketch-tool-"));
	const sent: SketchRequest[] = [];
	let tool: ToolDefinition | undefined;
	sketchExtension(
		agentDir,
		async (sketch) => (sent.push(sketch), result),
	)({
		registerTool: (t: ToolDefinition) => void (tool = t),
	} as unknown as ExtensionAPI);
	const run = async (params: Record<string, unknown>) =>
		(
			await tool!.execute(
				"call-1",
				params as never,
				undefined,
				undefined,
				{} as never,
			)
		).content as {
			type: string;
			text?: string;
			data?: string;
			mimeType?: string;
		}[];
	return { tool: tool!, run, sent, agentDir };
}

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("the sketch tool", () => {
	test("posts inline HTML as index.html and hands the model the picture people see", async () => {
		const { tool, run, sent } = sketchTool();
		expect(tool.name).toBe("sketch");
		const content = await run({
			title: " Trip budget ",
			html: "<h1>€1,840</h1>",
			height: 360,
		});
		expect(sent).toEqual([
			{
				title: "Trip budget",
				files: [{ path: "index.html", data: b64("<h1>€1,840</h1>") }],
				height: 360,
				save: undefined,
				replace: undefined,
			},
		]);
		expect(content[0]!.text).toStartWith(
			'Sketched "Trip budget" (id s1): it\'s in the chat now',
		);
		expect(content[0]!.text).toContain("It isn't saved");
		expect(content[1]).toEqual({
			type: "image",
			data: PICTURE.data,
			mimeType: "image/png",
		});
	});

	test("posts a file or a folder from /agent, dotfiles left out", async () => {
		const { run, sent, agentDir } = sketchTool(
			posted({ app: { id: "s2", name: "Rota", saved: true } }),
		);
		mkdirSync(join(agentDir, "apps/rota/img"), { recursive: true });
		writeFileSync(
			join(agentDir, "apps/rota/Rota.jsx"),
			"export default () => null",
		);
		writeFileSync(join(agentDir, "apps/rota/index.html"), "<p>");
		writeFileSync(join(agentDir, "apps/rota/img/a.png"), "png");
		writeFileSync(join(agentDir, "apps/rota/.DS_Store"), "x");
		await run({ title: "Rota", file: "apps/rota/Rota.jsx" });
		expect(sent[0]!.files).toEqual([
			{ path: "Rota.jsx", data: b64("export default () => null") },
		]);
		const content = await run({
			title: "Rota",
			file: join(agentDir, "apps/rota"),
			save: true,
		});
		expect(sent[1]!.files.map((f) => f.path)).toEqual([
			"Rota.jsx",
			"img/a.png",
			"index.html",
		]);
		expect(sent[1]!.save).toBe(true);
		expect(content[0]!.text).toContain("It's saved");
	});

	test("refuses a folder past the API's limits (500 files, 50 MB) before reading it all", async () => {
		const { run, sent, agentDir } = sketchTool();
		mkdirSync(join(agentDir, "many/deep"), { recursive: true });
		for (let i = 0; i < 501; i++)
			writeFileSync(
				join(agentDir, i % 2 ? "many/deep" : "many", `f${i}.txt`),
				"x",
			);
		await expect(run({ title: "Many", file: "many" })).rejects.toThrow(
			"many has more than 500 files; a sketch can have at most 500",
		);

		mkdirSync(join(agentDir, "big"));
		writeFileSync(join(agentDir, "big/index.html"), "<p>");
		writeFileSync(
			join(agentDir, "big/video.mp4"),
			Buffer.alloc(50 * 1024 * 1024 + 1),
		);
		await expect(run({ title: "Big", file: "big" })).rejects.toThrow(
			"big is over 50 MB; a sketch can be at most 50 MB",
		);
		expect(sent).toEqual([]);
	});

	test("says what the page threw, or that no picture came back", async () => {
		const { run } = sketchTool(
			posted({
				picture: null,
				errors: ["ReferenceError: total is not defined"],
			}),
		);
		const content = await run({ title: "Split", html: "<p>" });
		expect(content).toHaveLength(1);
		expect(content[0]!.text).toContain(
			"The page threw while it rendered; fix it and sketch again with replace set to its id:\n- ReferenceError: total is not defined",
		);
		expect(content[0]!.text).toContain("No picture came back");
	});

	test("drawing again in a sketch's place passes its id", async () => {
		const { run, sent } = sketchTool();
		const content = await run({ title: "Split", html: "<p>", replace: "s0" });
		expect(sent[0]!.replace).toBe("s0");
		expect(content[0]!.text).toContain("with replace set to its id");
	});

	test("needs a title and exactly one of html or file", async () => {
		const { run, sent } = sketchTool();
		await expect(run({ title: " ", html: "<p>" })).rejects.toThrow("title");
		await expect(run({ title: "X" })).rejects.toThrow("either html or file");
		await expect(
			run({ title: "X", html: "<p>", file: "a.html" }),
		).rejects.toThrow("either html or file");
		await expect(run({ title: "X", file: "missing.html" })).rejects.toThrow(
			"Nothing at missing.html",
		);
		expect(sent).toEqual([]);
	});
});

describe("sketches over HTTP", () => {
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
						? posted()
						: { message: "The sketch didn't build: Unexpected token" },
				),
				{ status },
			);
		}) as unknown as typeof fetch;
		const post = sketchesOverHttp("http://api.test/", "g1");
		const sketch = {
			title: "T",
			files: [{ path: "index.html", data: "PHA+" }],
		};
		expect(await post(sketch)).toEqual(posted());
		expect(calls).toEqual([
			{
				url: "http://api.test/cli/sketches",
				init: {
					method: "POST",
					headers: { "x-dev-chat": "g1", "content-type": "application/json" },
					body: JSON.stringify(sketch),
				},
			},
		]);
		status = 400;
		await expect(post(sketch)).rejects.toThrow("Unexpected token");
	});
});
