import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface ChannelJoinBarProps {
	channelName: string;
	isJoining: boolean;
	onJoin: () => void;
}

export function ChannelJoinBar({
	channelName,
	isJoining,
	onJoin,
}: ChannelJoinBarProps) {
	return (
		<div className="flex shrink-0 flex-col items-center gap-2 border-t border-border px-4 py-4">
			<span className="text-sm">
				<Trans>You're viewing #{channelName}</Trans>
			</span>
			<Button size="sm" onClick={onJoin} disabled={isJoining}>
				<Trans>Join channel</Trans>
			</Button>
		</div>
	);
}
