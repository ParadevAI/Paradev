import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import type { SlackPersonView } from "../../types";

/**
 * One person in Slack's @ picker: rounded-square avatar, name, a presence
 * mark (a square for someone from another organization, as Slack draws it),
 * the real name behind a handle, and "Not in channel" with their
 * organization's icon on the right.
 */
export function SlackPersonRow({ person }: { person: SlackPersonView }) {
	const { t } = useLingui();
	const external = person.team !== null;
	return (
		<>
			<Avatar className="size-5 shrink-0 rounded-[4px]">
				{person.avatar ? <AvatarImage src={person.avatar} alt="" /> : null}
				<AvatarFallback className="rounded-[4px] text-[10px]">
					{person.name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<span className="truncate font-semibold">{person.name}</span>
			{person.isReader && (
				<span className="-ml-1 shrink-0 font-semibold">
					<Trans>(you)</Trans>
				</span>
			)}
			{person.isBot && (
				<span className="shrink-0 rounded-[3px] bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
					<Trans>App</Trans>
				</span>
			)}
			{person.presence && !person.isBot && (
				<span
					role="img"
					aria-label={person.presence === "active" ? t`Active` : t`Away`}
					className={cn(
						"size-[9px] shrink-0",
						external ? "rounded-[2px]" : "rounded-full",
						person.presence === "active"
							? "bg-success"
							: "border-2 border-muted-foreground",
					)}
				/>
			)}
			{person.realName && (
				<span className="truncate text-muted-foreground">
					{person.realName}
				</span>
			)}
			{!person.inChannel && (
				<span className="ml-auto flex shrink-0 items-center gap-3.5 pl-4 text-muted-foreground">
					{person.team?.icon && (
						<img
							src={person.team.icon}
							alt=""
							className="size-3.5 rounded-[3px]"
						/>
					)}
					<Trans>Not in channel</Trans>
				</span>
			)}
		</>
	);
}
