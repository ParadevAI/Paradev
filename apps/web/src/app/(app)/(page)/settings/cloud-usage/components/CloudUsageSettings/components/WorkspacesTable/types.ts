import type { RouterOutputs } from "@superset/trpc";

export type WorkspaceRef = Extract<
	RouterOutputs["cloud"]["usage"]["query"]["items"][number]["ref"],
	{ status: unknown }
>;
