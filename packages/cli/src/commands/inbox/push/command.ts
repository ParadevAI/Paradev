import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { uploadDocument } from "../../pages/publish/utils/upload";
import { resolveWorkspaceId } from "../../pages/workspaceRef";
import { readDocument } from "../document";
import { agentSessionId } from "../session";

const MIN_WHY_HINT =
	'Say what you could not do yourself: "The proration policy isn\'t written anywhere I can read"';

export default command({
	description:
		"Push a card to someone's inbox. Prints the card id; pair it with `inbox wait` to block until they answer",
	options: {
		title: string().required().desc("One line, imperative, names the thing"),
		why: string()
			.required()
			.desc("What the agent could not do itself. Required, and checked"),
		body: string().desc("Two or three sentences of context"),
		to: string().desc(
			"Recipient, by email or user id. Must be in the organization. Defaults to you",
		),
		page: string().desc(
			"What opens from the card: a block document (.json, see `inbox page --help`), an .html file to publish as a page (visible to the organization when --to is set), or an existing page id",
		),
		key: string().desc(
			"Idempotency key, scoped to this session. Pushing again with the same key edits the card instead of adding one",
		),
		showAt: string().desc(
			"ISO time before which the card waits under Scheduled and does not badge",
		),
		workspace: string().desc(
			"Workspace this card belongs to, by name or id (defaults to $SUPERSET_WORKSPACE_ID)",
		),
	},
	run: async ({ ctx, options }) => {
		const why = options.why.trim();
		if (why.length < 12) {
			throw new CLIError("--why is too short to be a reason", MIN_WHY_HINT);
		}

		let showAt: Date | undefined;
		if (options.showAt) {
			showAt = new Date(options.showAt);
			if (Number.isNaN(showAt.getTime())) {
				throw new CLIError(
					`--show-at: "${options.showAt}" is not a date`,
					"Use ISO 8601, e.g. 2026-09-18T09:00",
				);
			}
		}

		const workspaceRef = options.workspace ?? process.env.SUPERSET_WORKSPACE_ID;
		const workspaceId = workspaceRef
			? await resolveWorkspaceId({
					value: workspaceRef,
					organizationId: ctx.config.organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				})
			: undefined;

		const attached = options.page
			? await resolveAttachment({
					ref: options.page,
					workspaceId,
					visibility: options.to ? "org" : "just_me",
					api: ctx.api,
				})
			: {};

		const result = await ctx.api.inbox.push.mutate({
			title: options.title,
			why,
			body: options.body ?? undefined,
			to: options.to ?? undefined,
			key: options.key ?? undefined,
			...attached,
			showAt,
			agentSessionId: agentSessionId(),
			workspaceId,
			hostId: getHostId(),
		});

		const card = result.card;
		const who =
			card.recipientId === card.sentBy?.id ? "you" : (options.to ?? "them");
		return {
			data: card,
			message: `${result.created ? "Pushed" : "Updated"} ${card.id} for ${who}: ${card.title}\nWait for an answer with: superset inbox wait ${card.id}`,
		};
	},
});

type Attachment =
	| { pageId: string }
	| { document: ReturnType<typeof readDocument> };

async function resolveAttachment({
	ref,
	workspaceId,
	visibility,
	api,
}: {
	ref: string;
	workspaceId: string | undefined;
	visibility: "org" | "just_me";
	api: Parameters<typeof uploadDocument>[0]["api"];
}): Promise<Attachment> {
	const UUID =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (UUID.test(ref)) return { pageId: ref };

	const inputPath = resolve(process.cwd(), ref);
	const stat = statSync(inputPath, { throwIfNoEntry: false });
	if (!stat?.isFile()) {
		throw new CLIError(
			`--page: "${ref}" is neither a page id nor a file`,
			"Pass a block document (.json), an .html file to publish, or an existing page id",
		);
	}
	const ext = extname(inputPath).toLowerCase();
	if (ext === ".json") return { document: readDocument(inputPath) };
	if (ext !== ".html") {
		throw new CLIError(
			"--page: only .json block documents and .html files are accepted",
		);
	}
	const filename = basename(inputPath);
	const { fileId } = await uploadDocument({
		api,
		bytes: readFileSync(inputPath),
		filename,
	});
	const page = await api.page.publish.mutate({
		fileId,
		filename,
		visibility,
		...(workspaceId ? { workspaceId, entryPath: filename } : {}),
	});
	return { pageId: page.id };
}
