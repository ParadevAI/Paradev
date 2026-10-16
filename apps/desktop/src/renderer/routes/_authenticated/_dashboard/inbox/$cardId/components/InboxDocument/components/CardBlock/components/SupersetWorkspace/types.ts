import type { RouterOutputs } from "@superset/trpc";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type CardView = NonNullable<
	Extract<DocumentBlocks[number], { type: "card" }>["resolved"]["view"]
>;

export type SupersetWorkspaceView = Extract<
	CardView,
	{ kind: "superset.agent_finished" }
>["workspace"];
