import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuMail } from "react-icons/lu";
import { useUserPresence } from "renderer/stores/org-presence";
import { useOrgMember } from "../../hooks/useOrgMember";
import { PersonAvatar } from "../PersonAvatar";

interface PersonCardProps {
	userId: string;
	name: string;
	image: string | null;
	isSelf: boolean;
	onViewProfile: () => void;
}

/** Who someone is at a glance: photo, name, whether they are around, and how to reach them. */
export function PersonCard({
	userId,
	name,
	image,
	isSelf,
	onViewProfile,
}: PersonCardProps) {
	const member = useOrgMember(userId);
	const active = useUserPresence(userId) === "active";
	const role =
		member?.role === "owner" || member?.role === "admin" ? member.role : null;
	return (
		<div className="flex w-72 flex-col">
			{role && (
				<div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
					{role === "owner" ? <Trans>Owner</Trans> : <Trans>Admin</Trans>}
				</div>
			)}
			<div className="flex items-center gap-3 p-4">
				<PersonAvatar size="xl" name={name} image={image} className="size-16" />
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="flex items-center gap-1.5 truncate text-sm font-semibold">
						<span className="truncate">{name}</span>
						{isSelf && (
							<span className="shrink-0 font-normal text-muted-foreground">
								<Trans>(you)</Trans>
							</span>
						)}
						{active && (
							<span className="size-2 shrink-0 rounded-full bg-emerald-500" />
						)}
					</span>
					{member?.user.email && (
						<span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
							<LuMail className="size-3.5 shrink-0" />
							<span className="truncate">{member.user.email}</span>
						</span>
					)}
				</div>
			</div>
			<div className="border-t border-border p-3">
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					onClick={onViewProfile}
				>
					<Trans>View profile</Trans>
				</Button>
			</div>
		</div>
	);
}
