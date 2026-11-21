import type { RouterOutputs } from "@superset/trpc";

type TaskRecord = NonNullable<RouterOutputs["task"]["byIdOrSlug"]>;
type TaskStatus = RouterOutputs["task"]["statuses"]["list"][number];

export type CloudTask = Pick<TaskRecord, "id" | "slug" | "title"> & {
	status: Pick<TaskStatus, "type" | "color" | "progressPercent"> | null;
};
