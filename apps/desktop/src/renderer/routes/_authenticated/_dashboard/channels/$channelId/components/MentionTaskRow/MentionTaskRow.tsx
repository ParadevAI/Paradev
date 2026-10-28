import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";

/** A task in the @ menu: status, slug, then title. */
export function MentionTaskRow({ task }: { task: CloudTask }) {
	return (
		<>
			<span className="flex size-5 shrink-0 items-center justify-center">
				<CloudTaskIcon task={task} />
			</span>
			<span className="shrink-0 font-mono text-muted-foreground text-xs">
				{task.slug}
			</span>
			<span className="truncate">{task.title}</span>
		</>
	);
}
