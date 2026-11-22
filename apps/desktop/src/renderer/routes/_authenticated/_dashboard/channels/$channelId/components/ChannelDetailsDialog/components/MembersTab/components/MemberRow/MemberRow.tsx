import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuChevronDown, LuTrash2 } from "react-icons/lu";
import { PersonRow } from "../PersonRow";

type ChannelMember = Extract<
	RouterOutputs["channel"]["members"][number],
	{ kind: "person" }
>;
type ChannelRole = ChannelMember["role"];

interface MemberRowProps {
	member: ChannelMember;
	isSelf: boolean;
	canManage: boolean;
	onSetRole: (role: ChannelRole) => void;
	onRemove: () => void;
}

export function MemberRow({
	member,
	isSelf,
	canManage,
	onSetRole,
	onRemove,
}: MemberRowProps) {
	const { t } = useLingui();
	const roles: { id: ChannelRole; label: string; description: string }[] = [
		{
			id: "member",
			label: t({ message: "Member" }),
			description: t({ message: "Read and post messages" }),
		},
		{
			id: "admin",
			label: t({ message: "Channel Manager" }),
			description: t({ message: "Also edit the channel and its members" }),
		},
	];
	const label = roles.find((role) => role.id === member.role)?.label ?? "";

	return (
		<PersonRow
			userId={member.actorId}
			name={member.name}
			email={member.email}
			image={member.image}
			isSelf={isSelf}
			trailing={
				canManage ? (
					<DropdownMenu>
						<DropdownMenuTrigger
							className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
							aria-label={t({ message: `Role for ${member.name}` })}
						>
							{label}
							<LuChevronDown className="size-3" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-60">
							{roles.map((role) => (
								<DropdownMenuItem
									key={role.id}
									onSelect={() => {
										if (role.id !== member.role) onSetRole(role.id);
									}}
									className="items-start"
								>
									<div className="min-w-0 flex-1">
										<p className="text-sm">{role.label}</p>
										<p className="text-xs text-muted-foreground">
											{role.description}
										</p>
									</div>
									{role.id === member.role && (
										<LuCheck className="mt-0.5 size-3.5 text-foreground" />
									)}
								</DropdownMenuItem>
							))}
							{!isSelf && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem variant="destructive" onSelect={onRemove}>
										<LuTrash2 className="size-3.5" />
										<Trans>Remove from channel</Trans>
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<span className="shrink-0 px-1.5 text-xs text-muted-foreground">
						{label}
					</span>
				)
			}
		/>
	);
}
