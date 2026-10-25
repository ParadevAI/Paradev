import { z } from "zod";

export const RELEASE_HIGHLIGHT_ICONS = [
	"sparkles",
	"git-pull-request",
	"terminal",
	"bot",
	"list-checks",
	"plug",
	"cloud",
	"zap",
	"message",
	"layout",
	"shield",
	"wrench",
	"link",
	"search",
	"keyboard",
	"tablet",
	"history",
	"users",
] as const;
export type ReleaseHighlightIcon = (typeof RELEASE_HIGHLIGHT_ICONS)[number];

export const releaseHighlightSchema = z.object({
	// An app older than the feed must still render an icon it doesn't know.
	icon: z.enum(RELEASE_HIGHLIGHT_ICONS).catch("sparkles"),
	title: z.string().min(1),
	description: z.string().min(1),
});
export type ReleaseHighlight = z.infer<typeof releaseHighlightSchema>;

export const releaseNoteSchema = z.object({
	version: z.string(),
	/** ISO date, `YYYY-MM-DD`. */
	date: z.string(),
	title: z.string(),
	image: z.url().nullish(),
	url: z.url(),
	highlights: z.array(releaseHighlightSchema).min(1),
});
export type ReleaseNote = z.infer<typeof releaseNoteSchema>;

export const releaseNotesResponseSchema = z.object({
	releases: z.array(releaseNoteSchema),
});
export type ReleaseNotesResponse = z.infer<typeof releaseNotesResponseSchema>;

export const RELEASE_NOTES_PATH = "/changelog.json";
