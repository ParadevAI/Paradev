import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuClock } from "react-icons/lu";
import {
	type SlackPerson,
	useSlackWorkspace,
} from "../../../../providers/SlackWorkspaceProvider";

interface PersonCardProps {
	person: SlackPerson;
	children: ReactNode;
}

function localTime(timezone: string): string | null {
	try {
		return formatDate(new Date(), {
			hour: "numeric",
			minute: "2-digit",
			timeZone: timezone,
		});
	} catch {
		return null;
	}
}

/** Slack's profile card on hover: role, photo, name and presence, then local time and a way into Slack. */
export function PersonCard({ person, children }: PersonCardProps) {
	const { t } = useLingui();
	const { workspaceUrl } = useSlackWorkspace();
	const time = person.timezone ? localTime(person.timezone) : null;
	const role = person.role
		? {
				primary_owner: t({ message: "Workspace Primary Owner" }),
				owner: t({ message: "Workspace Owner" }),
				admin: t({ message: "Workspace Admin" }),
			}[person.role]
		: null;
	const heading = role ?? person.team?.name ?? null;
	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				side="top"
				align="start"
				className="w-[340px] overflow-hidden p-0 text-[13px]"
			>
				{heading && (
					<div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5 font-semibold text-muted-foreground">
						{!role && person.team?.icon && (
							<img
								src={person.team.icon}
								alt=""
								className="size-4 rounded-sm"
							/>
						)}
						{heading}
					</div>
				)}
				<div className="flex items-center gap-3 px-4 py-4">
					<Avatar className="size-[72px] shrink-0 rounded-xl">
						{person.avatar && <AvatarImage src={person.avatar} alt="" />}
						<AvatarFallback className="rounded-xl text-xl">
							{person.name.slice(0, 1).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="flex items-center gap-1.5">
							<span className="truncate text-[15px] font-bold text-foreground">
								{person.isReader ? (
									<Trans>{person.name} (you)</Trans>
								) : (
									person.name
								)}
							</span>
							{person.presence && (
								<span
									role="img"
									aria-label={
										person.presence === "active"
											? t({ message: "Active" })
											: t({ message: "Away" })
									}
									className={cn(
										"size-2.5 shrink-0 rounded-full",
										person.presence === "active"
											? "bg-emerald-500"
											: "border-2 border-muted-foreground",
									)}
								/>
							)}
							{person.isBot && (
								<span className="rounded-[3px] bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
									<Trans>App</Trans>
								</span>
							)}
						</span>
						{person.realName && (
							<span className="truncate text-muted-foreground">
								{person.realName}
							</span>
						)}
						{person.title && (
							<span className="truncate text-foreground">{person.title}</span>
						)}
					</div>
				</div>
				{(time || workspaceUrl) && (
					<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
						{time && (
							<span className="flex items-center gap-2 text-muted-foreground">
								<LuClock className="size-4" />
								<Trans>{time} local time</Trans>
							</span>
						)}
						{workspaceUrl && (
							<Button variant="outline" size="sm" asChild>
								<a
									href={`${workspaceUrl}/team/${person.id}`}
									target="_blank"
									rel="noreferrer"
								>
									<Trans>Open in Slack</Trans>
								</a>
							</Button>
						)}
					</div>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
