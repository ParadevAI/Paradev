import { Plural, Trans } from "@lingui/react/macro";
import type { SuggestionItem } from "@superset/shared/sharing";
import { Lock } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import { GranteeAvatar } from "../../../GranteeAvatar";
import { SelectionTick } from "./components/SelectionTick";

interface InviteSuggestionProps {
	item: SuggestionItem;
	active: boolean;
	organizationName: string;
	inviteError: boolean;
	/** No query yet, so people are suggestions rather than results. */
	browsing: boolean;
	onPick: () => void;
}

const rowClass =
	"flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm";

export function InviteSuggestion({
	item,
	active,
	organizationName,
	inviteError,
	browsing,
	onPick,
}: InviteSuggestionProps) {
	switch (item.kind) {
		case "section":
			return (
				<p className="px-2 pt-3 pb-1 text-muted-foreground text-xs first:pt-1">
					{item.section === "invite" ? (
						<Trans>Invite to {organizationName}</Trans>
					) : item.section === "teams" ? (
						<Trans>Teams</Trans>
					) : browsing ? (
						<Trans>Suggested</Trans>
					) : (
						<Trans>People</Trans>
					)}
				</p>
			);
		case "heading":
			return (
				<p className="px-2 pt-1 pb-1 text-muted-foreground text-xs">
					<Trans>Keep typing an email to invite</Trans>
				</p>
			);
		case "empty":
			return (
				<p className="px-2 py-2 text-muted-foreground text-xs">
					<Trans>
						No one in {organizationName} matches. Type a full email to invite
						someone new.
					</Trans>
				</p>
			);
		case "blocked":
			return (
				<div className={cn(rowClass, "cursor-default")}>
					<span className="grid size-7 shrink-0 place-items-center rounded-full border border-muted-foreground/60 border-dashed text-muted-foreground">
						<Lock className="size-3.5" />
					</span>
					<div className="min-w-0">
						<p>
							<Trans>Invite to {organizationName}</Trans>
						</p>
						<p className="text-muted-foreground text-xs">
							<Trans>
								Only {organizationName} admins can invite new people
							</Trans>
						</p>
					</div>
				</div>
			);
		case "team":
		case "member":
			return (
				<button
					type="button"
					role="option"
					aria-selected={item.selected}
					disabled={item.hasAccess}
					tabIndex={-1}
					onClick={onPick}
					className={cn(
						rowClass,
						active && "bg-accent",
						item.hasAccess ? "cursor-default opacity-55" : "hover:bg-accent",
					)}
				>
					{item.kind === "team" ? (
						<GranteeAvatar kind="team" />
					) : (
						<GranteeAvatar
							kind="person"
							name={item.person.name}
							image={item.person.image}
						/>
					)}
					<div className="min-w-0 flex-1">
						<p className="truncate">
							{item.kind === "team" ? item.team.name : item.person.name}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{item.kind === "team" ? (
								<Plural
									value={item.team.memberIds.length}
									one="# person"
									other="# people"
								/>
							) : (
								item.person.email
							)}
						</p>
					</div>
					{item.hasAccess ? (
						<span className="shrink-0 text-muted-foreground text-xs">
							<Trans>Has access</Trans>
						</span>
					) : (
						<SelectionTick selected={item.selected} />
					)}
				</button>
			);
		case "invite":
		case "invalid": {
			const invite = item.kind === "invite" ? item : null;
			return (
				<button
					type="button"
					role="option"
					aria-selected={invite?.selected ?? false}
					disabled={invite?.invited}
					tabIndex={-1}
					onClick={onPick}
					className={cn(
						rowClass,
						active && "bg-accent",
						invite?.invited ? "cursor-default opacity-55" : "hover:bg-accent",
					)}
				>
					<GranteeAvatar kind="invite" />
					<div className="min-w-0 flex-1">
						<p className="truncate">
							{item.kind === "invite" ? item.email : item.text}
						</p>
						{invite ? (
							<p className="truncate text-muted-foreground text-xs">
								<Trans>Gets an invite to join {organizationName}</Trans>
							</p>
						) : inviteError ? (
							<p className="text-destructive text-xs">
								<Trans>Enter a full email address</Trans>
							</p>
						) : null}
					</div>
					{invite?.invited ? (
						<span className="shrink-0 text-muted-foreground text-xs">
							<Trans>Invited</Trans>
						</span>
					) : invite?.completion && active && !invite.selected ? (
						<kbd className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
							<Trans>Tab to fill</Trans>
						</kbd>
					) : invite ? (
						<SelectionTick selected={invite.selected} />
					) : null}
				</button>
			);
		}
	}
}
