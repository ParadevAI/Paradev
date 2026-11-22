import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { MessageSquare, SquareTerminal } from "lucide-react";

export function ForkMenuItems({
	onForkIntoCli,
	onForkIntoChat,
}: {
	onForkIntoCli?: () => void;
	onForkIntoChat?: () => void;
}) {
	return (
		<>
			{onForkIntoCli && (
				<DropdownMenuItem onSelect={onForkIntoCli}>
					<SquareTerminal />
					<Trans>Fork into CLI</Trans>
				</DropdownMenuItem>
			)}
			{onForkIntoChat && (
				<DropdownMenuItem onSelect={onForkIntoChat}>
					<MessageSquare />
					<Trans>Fork into Chat</Trans>
				</DropdownMenuItem>
			)}
		</>
	);
}
