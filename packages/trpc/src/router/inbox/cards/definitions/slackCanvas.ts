import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type SlackCanvasView,
	withInput,
} from "../types";
import {
	type CanvasSection,
	canvasMarkdown,
	canvasSections,
} from "./slackCanvasContent";
import { type Reader, slackReader } from "./slackCompose";
import { isSlack, slack } from "./slackWorkspace";

interface Refs {
	canvas: string;
	change: "replace" | "insert_after" | "append" | "delete";
	find?: string;
	markdown?: string;
}

interface Data {
	reader: Reader;
	canvas: string;
	title: string;
	change: Refs["change"];
	section: CanvasSection | null;
	version: number;
	editable: boolean;
	cannotSay: boolean;
}

const CANVAS_ID = /^F[A-Z0-9]{6,20}$/;
const MARKDOWN_MAX = 8000;
const FIND_MAX = 300;
const HTML_MAX = 2_000_000;
const OPERATION = {
	replace: "replace",
	insert_after: "insert_after",
	append: "insert_at_end",
	delete: "delete",
} as const;
const EDITED =
	"This canvas was edited since you looked. Read it again before you apply";

const fileSchema = z.object({
	file: z.object({
		id: z.string(),
		title: z.string().optional(),
		filetype: z.string().optional(),
		url_private: z.string().optional(),
		permalink: z.string().optional(),
		updated: z.number().optional(),
		edit_timestamp: z.number().optional(),
		editable: z.boolean().optional(),
		access: z.string().optional(),
	}),
});

async function read(reader: Reader, canvas: string) {
	const { file } = await slack(reader.token, "files.info", fileSchema, {
		file: canvas,
	}).catch((error) => {
		if (isSlack(error, "file_not_found"))
			throw new CardUnavailable(
				"gone",
				"That canvas is not one you can see in Slack",
			);
		throw error;
	});
	if (
		file.filetype !== "quip" ||
		!file.url_private ||
		!/^https:\/\/[a-z0-9.-]+\.slack\.com\//.test(file.url_private)
	)
		throw new CardUnavailable("error", "That Slack file is not a canvas");
	const html = await fetch(file.url_private, {
		headers: { authorization: `Bearer ${reader.token}` },
		signal: AbortSignal.timeout(10_000),
	}).then(
		(response) => (response.ok ? response.text() : ""),
		() => "",
	);
	if (!html.includes("quip-canvas-content") || html.length > HTML_MAX)
		throw new CardUnavailable("error", "Slack did not give this canvas's text");
	return { file, sections: canvasSections(html, file.title) };
}

/** One change to a canvas the agent proposes, shown against the section it replaces. */
export const slackCanvas = defineCard<Refs, Data>({
	type: "slack.canvas",
	label: "Slack canvas",
	ask: "Approve canvas edit",
	brand: "slack",
	refs: z
		.object({
			canvas: z.string().regex(CANVAS_ID),
			change: z.enum(["replace", "insert_after", "append", "delete"]),
			/** Words of the section the change is about. */
			find: z.string().trim().min(1).max(FIND_MAX).optional(),
			markdown: z.string().max(MARKDOWN_MAX).optional(),
		})
		.refine((refs) => refs.change === "append" || Boolean(refs.find))
		.refine(
			(refs) => refs.change === "delete" || Boolean(refs.markdown?.trim()),
		),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const { file, sections } = await read(reader, refs.canvas);
		const matches =
			refs.change === "append"
				? []
				: sections.filter((each) => each.text.includes(refs.find ?? ""));
		if (matches.length > 1)
			throw new CardUnavailable(
				"error",
				`These words are in ${matches.length} parts of the canvas; the change must name one`,
			);
		const section = matches[0] ?? null;
		if (refs.change !== "append" && !section)
			throw new CardUnavailable(
				"gone",
				"The canvas no longer has the part this change is about",
			);
		const cannotSay =
			Boolean(section?.lossy) &&
			(refs.change === "replace" || refs.change === "delete");
		const title = file.title ?? "Canvas";
		const version = Math.max(file.edit_timestamp ?? 0, file.updated ?? 0);
		const editable = file.editable !== false && file.access !== "read";
		const view: SlackCanvasView = {
			kind: "slack.canvas",
			workspace: reader.workspace,
			canvas: { id: file.id, title, url: file.permalink ?? null },
			change: refs.change,
			section: section?.id ?? null,
			before: section?.markdown ?? null,
			lossy: cannotSay,
			after: refs.change === "delete" ? "" : (refs.markdown ?? ""),
			content: canvasMarkdown(sections),
			version,
			editable,
		};
		const fields: CardField[] = [
			{ label: "Canvas", value: title, href: file.permalink },
			{
				label: "Change",
				value: {
					replace: "Replace a part",
					insert_after: "Add after a part",
					append: "Add at the end",
					delete: "Remove a part",
				}[refs.change],
			},
		];
		return {
			title,
			subtitle: reader.workspace,
			fields,
			body: view.after.slice(0, 500) || undefined,
			view,
			data: {
				reader,
				canvas: file.id,
				title,
				change: refs.change,
				section,
				version,
				editable,
				cannotSay,
			},
		};
	},
	actions: {
		apply: {
			label: () => "Apply to canvas",
			style: "primary",
			role: "primary",
			available: (data) =>
				!data.editable
					? "You can only read this canvas in Slack"
					: data.cannotSay
						? "This part has a mention, file or embed this card cannot show. Change it in Slack"
						: true,
			run: withInput(
				z.object({
					markdown: z.string().max(MARKDOWN_MAX).optional(),
					/** `section` and `before` from the view: the part the reader saw. */
					section: z.string().max(200).nullable(),
					before: z.string().max(100_000).nullable(),
					version: z.number().int(),
				}),
				async ({ data, input }) => {
					if (
						input.section !== (data.section?.id ?? null) ||
						input.before !== (data.section?.markdown ?? null) ||
						(data.change !== "replace" &&
							data.change !== "delete" &&
							(data.version === 0 || input.version !== data.version))
					)
						throw new CardUnavailable("error", EDITED);
					const markdown = input.markdown?.trim() ?? "";
					if (data.change !== "delete" && !markdown)
						throw new CardUnavailable("error", "The change has no text");
					await slack(
						data.reader.token,
						"canvases.edit",
						z.object({ ok: z.boolean() }),
						{
							canvas_id: data.canvas,
							changes: [
								{
									operation: OPERATION[data.change],
									...(data.section ? { section_id: data.section.id } : {}),
									...(data.change === "delete"
										? {}
										: { document_content: { type: "markdown", markdown } }),
								},
							],
						},
						true,
					);
					return {
						outcome: { canvas: data.canvas, change: data.change },
						notice: { tone: "good", text: `Changed "${data.title}"` },
					};
				},
			),
		},
		dismiss: {
			label: () => "Leave the canvas",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { changed: false } };
			},
		},
	},
});
