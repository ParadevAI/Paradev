import { z } from "zod";
import { env } from "../../../../env";
import { fileTickets } from "./fileTickets";
import { slackBots } from "./slackBots";

const TICKET_TTL_S = 6 * 60 * 60;
const SLACK_FILE_ID = /^F[A-Z0-9]{6,20}$/;

const ticketSchema = z.object({
	o: z.string().uuid(),
	t: z.string().min(1),
	f: z.string().regex(SLACK_FILE_ID),
});
type Ticket = z.infer<typeof ticketSchema>;

export interface SlackFileTickets {
	urlFor: (
		organizationId: string,
		teamId: string,
		fileId: string,
	) => string | null;
	read: (token: string) => Ticket | null;
}

/** Slack serves a file's images only with a token; the API fetches them with the bot's. */
export function slackFileTickets(
	{ secret, apiUrl }: { secret: string; apiUrl: string },
	now: () => number = Date.now,
): SlackFileTickets {
	const tickets = fileTickets(
		{
			secret,
			purpose: "inbox.slack-file",
			schema: ticketSchema,
			ttlSeconds: TICKET_TTL_S,
		},
		now,
	);
	return {
		urlFor(organizationId, teamId, fileId) {
			if (!SLACK_FILE_ID.test(fileId)) return null;
			const token = tickets.sign({ o: organizationId, t: teamId, f: fileId });
			return `${apiUrl}/api/inbox/slack-files/${token}`;
		},
		read: tickets.read,
	};
}

const tickets = () =>
	slackFileTickets({
		secret: env.USERCONTENT_TOKEN_SECRET,
		apiUrl: env.NEXT_PUBLIC_API_URL,
	});

export function slackFileUrl(
	organizationId: string,
	teamId: string,
	fileId: string,
): string | null {
	return tickets().urlFor(organizationId, teamId, fileId);
}

const fileInfoSchema = z.object({
	ok: z.literal(true),
	file: z
		.object({
			mimetype: z.string().optional(),
			thumb_720: z.string().optional(),
			thumb_480: z.string().optional(),
			thumb_360: z.string().optional(),
			url_private: z.string().optional(),
		})
		.passthrough(),
});

/** The image behind a signed ticket, fetched from Slack with the organization's bot token. */
export async function serveSlackFile(
	token: string,
	read: SlackFileTickets["read"] = (t) => tickets().read(t),
): Promise<Response> {
	const ticket = read(token);
	if (!ticket) return new Response("Not found", { status: 404 });
	const bot = (await slackBots(ticket.o).catch(() => null))?.get(ticket.t);
	if (!bot) return new Response("Not found", { status: 404 });
	const info = fileInfoSchema.safeParse(
		await fetch(
			`https://slack.com/api/files.info?${new URLSearchParams({ file: ticket.f })}`,
			{
				headers: { authorization: `Bearer ${bot}` },
				signal: AbortSignal.timeout(10_000),
			},
		)
			.then((r) => r.json())
			.catch(() => null),
	);
	if (!info.success || !info.data.file.mimetype?.startsWith("image/")) {
		return new Response("Not found", { status: 404 });
	}
	const { file } = info.data;
	const source =
		file.thumb_720 ?? file.thumb_480 ?? file.thumb_360 ?? file.url_private;
	if (!source || new URL(source).hostname !== "files.slack.com") {
		return new Response("Not found", { status: 404 });
	}
	const image = await fetch(source, {
		headers: { authorization: `Bearer ${bot}` },
		signal: AbortSignal.timeout(15_000),
	});
	const type = image.headers.get("content-type") ?? "";
	if (!image.ok || !image.body || !type.startsWith("image/")) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(image.body, {
		headers: {
			"content-type": type,
			"cache-control": `private, max-age=${TICKET_TTL_S}`,
			"x-content-type-options": "nosniff",
		},
	});
}
