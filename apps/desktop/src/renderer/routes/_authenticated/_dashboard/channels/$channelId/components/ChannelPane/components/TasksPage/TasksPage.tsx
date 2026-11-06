import { ChannelTasksTab } from "../../../ChannelTasksTab";

/** The channel's project tasks, as a page of the side pane. */
export function TasksPage({
	channelId,
	canAdd,
}: {
	channelId: string;
	canAdd: boolean;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ChannelTasksTab channelId={channelId} canAdd={canAdd} />
		</div>
	);
}
