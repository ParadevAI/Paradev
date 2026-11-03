import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useUserPresence } from "renderer/stores/org-presence";
import { PersonAvatar } from "../PersonAvatar";

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
	const { t } = useLingui();
	const presence = useUserPresence(userId);
	return (
		<>
			<PersonAvatar size="xs" name={name} image={image} />
			<span className="truncate font-semibold">{name}</span>
			{isSelf && (
				<span className="-ml-1 shrink-0 font-semibold">
					<Trans>(you)</Trans>
				</span>
			)}
			{presence !== "offline" && (
				<span
					role="img"
					aria-label={
						presence === "active"
							? t({ message: "Active" })
							: t({ message: "Away" })
					}
					className={cn(
						"size-[9px] shrink-0 rounded-full",
						presence === "active"
							? "bg-emerald-500"
							: "border-2 border-muted-foreground",
					)}
				/>
			)}
			{!isMember && (
				<span className="ml-auto shrink-0 pl-4 text-muted-foreground">
					<Trans>Not in channel</Trans>
				</span>
			)}
		</>
	);
}
