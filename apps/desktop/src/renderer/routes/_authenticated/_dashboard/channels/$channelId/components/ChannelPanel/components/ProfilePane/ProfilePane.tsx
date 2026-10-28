import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { LuCalendar, LuMail } from "react-icons/lu";
import { useUserPresence } from "renderer/stores/org-presence";
import { useOrgMember } from "../../../../hooks/useOrgMember";
import { PersonAvatar } from "../../../PersonAvatar";

interface ProfilePaneProps {
	userId: string;
	isSelf: boolean;
}

/** Someone's profile: photo, name, presence, role, and how to reach them. */
export function ProfilePane({ userId, isSelf }: ProfilePaneProps) {
	const member = useOrgMember(userId);
	const presence = useUserPresence(userId);
	if (!member) return null;
	const { name, email, image } = member.user;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-5 p-6">
				<PersonAvatar
					size="xl"
					name={name}
					image={image}
					className="size-48 self-center text-4xl"
				/>
				<div className="flex flex-col gap-2">
					<h2 className="flex items-center gap-2 text-xl font-bold">
						{name}
						{isSelf && (
							<span className="text-base font-normal text-muted-foreground">
								<Trans>(you)</Trans>
							</span>
						)}
					</h2>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span
							className={
								presence === "active"
									? "size-2.5 rounded-full bg-emerald-500"
									: "size-2.5 rounded-full border border-muted-foreground"
							}
						/>
						{presence === "active" ? (
							<Trans>Active</Trans>
						) : presence === "away" ? (
							<Trans>Away</Trans>
						) : (
							<Trans>Offline</Trans>
						)}
					</div>
				</div>
				<div className="flex flex-col gap-3 border-t border-border pt-5">
					<h3 className="text-sm font-semibold">
						<Trans>Contact information</Trans>
					</h3>
					<a
						href={`mailto:${email}`}
						className="flex items-center gap-3 text-sm hover:underline"
					>
						<span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
							<LuMail className="size-4" />
						</span>
						{email}
					</a>
				</div>
				<div className="flex items-center gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
					<LuCalendar className="size-4" />
					<Trans>
						Joined{" "}
						{formatDate(member.createdAt, { month: "long", year: "numeric" })}
					</Trans>
				</div>
			</div>
		</div>
	);
}
