import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** A file as the API takes it: a path inside the sketch, base64 content. */
interface WireFile {
	path: string;
	data: string;
}

export interface SketchRequest {
	title: string;
	files: WireFile[];
	height?: number;
	save?: boolean;
	replace?: string;
}

export interface SketchResult {
	app: { id: string; name: string; saved: boolean };
	/** The light picture people see in the chat, base64; null when the server couldn't render one. */
	picture: { type: string; data: string } | null;
	/** What the page threw while it rendered. */
	errors: string[];
}

/** Posts a sketch in the chat as the Dev's running turn. */
export type PostSketch = (sketch: SketchRequest) => Promise<SketchResult>;

/** `POST <api>/cli/sketches`, naming the chat (the box's proxy adds its credential). */
export function sketchesOverHttp(apiUrl: string, chatId: string): PostSketch {
	const url = `${apiUrl.replace(/\/+$/, "")}/cli/sketches`;
	return async (sketch) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "x-dev-chat": chatId, "content-type": "application/json" },
			body: JSON.stringify(sketch),
		});
		const body = (await res.json().catch(() => ({}))) as SketchResult & {
			message?: string;
		};
		if (!res.ok)
			throw new Error(body.message ?? `The API answered ${res.status}`);
		return body;
	};
}

const SketchParams = Type.Object({
	title: Type.String({
		description:
			'What it shows, in a few words: its name in the chat ("Trip budget", "Q3 vs Q4")',
	}),
	html: Type.Optional(
		Type.String({
			description:
				"A self-contained HTML page: inline <style> and <script>, Tailwind classes work. Give this or file",
		}),
	),
	file: Type.Optional(
		Type.String({
			description:
				"Instead of html: a .jsx/.tsx/.html file or a folder with index.html, under /agent",
		}),
	),
	height: Type.Optional(
		Type.Integer({
			minimum: 200,
			maximum: 1200,
			description:
				"The picture's height in px at 640 px wide (default 420); fit what you drew",
		}),
	),
	replace: Type.Optional(
		Type.String({
			description:
				"The id of a sketch you drew earlier in this turn: this one takes its place in the chat",
		}),
	),
	save: Type.Optional(
		Type.Boolean({
			description:
				"Save it for the chat at once: only for a tool people will come back to (it keeps data)",
		}),
	),
});

/** Folders that are never part of a sketch. */
const SKIPPED = new Set(["node_modules", ".git"]);
/** The API refuses more (app-build's limits); stopping here keeps a wrong folder (all of /agent) from being read and sent. */
const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** One file under its own name, or a folder's files under their paths inside it (dotfiles left out). */
async function readSketchFiles(
	agentDir: string,
	path: string,
): Promise<WireFile[]> {
	const full = resolve(agentDir, path);
	const info = await stat(full).catch(() => {
		throw new Error(`Nothing at ${path}`);
	});
	const paths = info.isDirectory() ? await walk(full, path) : [full];
	if (paths.length === 0) throw new Error(`${path} is empty`);
	const sizes = await Promise.all(paths.map(async (p) => (await stat(p)).size));
	if (sizes.reduce((a, b) => a + b, 0) > MAX_TOTAL_BYTES)
		throw new Error(`${path} is over 50 MB; a sketch can be at most 50 MB`);
	return Promise.all(
		paths.map(async (p) => ({
			path: info.isDirectory()
				? relative(full, p).split(sep).join("/")
				: basename(p),
			data: (await readFile(p)).toString("base64"),
		})),
	);
}

/** The folder's files, sorted; past `MAX_FILES` it stops walking and says so. */
async function walk(root: string, shown: string): Promise<string[]> {
	const found: string[] = [];
	const visit = async (dir: string) => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const e of entries.filter(
			(e) => !e.name.startsWith(".") && !SKIPPED.has(e.name),
		)) {
			if (e.isDirectory()) await visit(join(dir, e.name));
			else if (e.isFile() && found.push(join(dir, e.name)) > MAX_FILES)
				throw new Error(
					`${shown} has more than ${MAX_FILES} files; a sketch can have at most ${MAX_FILES}`,
				);
		}
	};
	await visit(root);
	return found.sort();
}

/** What the model reads after sketching: where it went, and what to fix if the page threw. */
function report(result: SketchResult) {
	const lines = [
		`Sketched "${result.app.name}" (id ${result.app.id}): it's in the chat now, as your message, and people open it beside the chat. People see it, so your reply doesn't describe it: reply with one short line it doesn't say (a question, a next step), or don't reply.`,
		result.app.saved
			? "It's saved: it's on everyone's list of sketches and keeps its data. Update it with `dev sketch publish <file> --app <id>`."
			: "It isn't saved: it lives in this message. If it turns into a tool people come back to, save it with `dev sketch save <id>`.",
	];
	if (result.errors.length)
		lines.push(
			`The page threw while it rendered; fix it and sketch again with replace set to its id:\n${result.errors.map((e) => `- ${e}`).join("\n")}`,
		);
	if (!result.picture)
		lines.push(
			"No picture came back (the renderer is off or failed): people see a plain card.",
		);
	else
		lines.push(
			"Below is the picture people see in the chat. Look at it: if it's cut off, touches the edges, leaves empty space below, or is wrong, sketch again (fix the padding, or fit height to what you drew) with replace set to its id, so it takes this one's place.",
		);
	return lines.join("\n");
}

/**
 * The `sketch` tool: draws something in the chat (a chart, a comparison, a plan, a diagram) as the Dev's message.
 * It comes back with the picture people see, so the Dev looks at what it drew. The Dev's own tool only:
 * subagents can't post.
 */
export function sketchExtension(agentDir: string, post: PostSketch) {
	return (pi: ExtensionAPI) => {
		pi.registerTool({
			name: "sketch",
			label: "Sketch",
			description:
				"Draw something in this chat: an HTML page or a React component, shown as your message (a picture people click to open it live beside the chat). For what people need to see to understand: options side by side (say your pick in one line of text and draw the comparison), a budget or split, a plan, timeline or schedule, a chart, a diagram. Never to ask people something (that's the question tool), and not for an answer a sentence gives.",
			promptSnippet:
				"Draw a visual (chart, comparison, plan, diagram) in the chat",
			parameters: SketchParams,
			executionMode: "sequential",
			async execute(_toolCallId, params) {
				const title = params.title.trim();
				if (!title) throw new Error("Give the sketch a title");
				if (!params.html === !params.file)
					throw new Error("Pass either html or file");
				const files = params.html
					? [
							{
								path: "index.html",
								data: Buffer.from(params.html).toString("base64"),
							},
						]
					: await readSketchFiles(agentDir, params.file!);
				const result = await post({
					title,
					files,
					height: params.height,
					save: params.save,
					replace: params.replace,
				});
				const text = { type: "text" as const, text: report(result) };
				const image = result.picture
					? [
							{
								type: "image" as const,
								data: result.picture.data,
								mimeType: result.picture.type,
							},
						]
					: [];
				return { content: [text, ...image], details: undefined };
			},
		});
	};
}
