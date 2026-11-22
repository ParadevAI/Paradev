import type { RouterOutputs } from "@superset/trpc";

export type PageCardCommentPreview = NonNullable<
	RouterOutputs["page"]["listPaginated"]["items"][number]["commentPreview"]
>;
