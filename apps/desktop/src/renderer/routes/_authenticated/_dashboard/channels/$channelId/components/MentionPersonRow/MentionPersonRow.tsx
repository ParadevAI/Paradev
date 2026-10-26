import { Trans } from "@lingui/react/macro";
import { PresenceAvatar } from "../PresenceAvatar";

interface MentionPersonRowProps {
	userId: string;
	name: string;
	image: string | null;
	isSelf: boolean;
	isMember: boolean;
}

/** A person in the @ menu, laid out the way Slack's mention menu is. */
export function MentionPersonRow({
	userId,
	name,
	image,
	isSelf,
	isMember,
}: MentionPersonRowProps) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2.5">
			<PresenceAvatar userId={userId} name={name} image={image} size="sm" />
			<span className="min-w-0 truncate font-semibold">
				{name}
				{isSelf && (
					<span className="font-normal">
						{" "}
						<Trans>(you)</Trans>
					</span>
				)}
			</span>
			{!isMember && (
				<span className="ms-auto shrink-0 ps-3 text-xs text-muted-foreground">
					<Trans>Not in channel</Trans>
				</span>
			)}
		</div>
	);
}
