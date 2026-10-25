import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuEllipsis } from "react-icons/lu";

interface MemberRowProps {
	member: {
		userId: string;
		name: string;
		email: string;
		image: string | null;
		role: "member" | "admin";
	};
	isSelf: boolean;
	canManage: boolean;
	onSetRole: (role: "member" | "admin") => void;
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
	return (
		<div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-fill-hover/50">
			<Avatar size="sm" fullName={member.name} image={member.image} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm">
					{member.name}
					{isSelf && (
						<span className="text-muted-foreground">
							{" "}
							<Trans>(you)</Trans>
						</span>
					)}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{member.email}
				</div>
			</div>
			{member.role === "admin" && (
				<span className="text-xs text-muted-foreground">
					<Trans>Admin</Trans>
				</span>
			)}
			{canManage && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Member options" })}
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							<LuEllipsis className="size-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{member.role === "admin" ? (
							<DropdownMenuItem onSelect={() => onSetRole("member")}>
								<Trans>Remove admin</Trans>
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onSelect={() => onSetRole("admin")}>
								<Trans>Make admin</Trans>
							</DropdownMenuItem>
						)}
						{!isSelf && (
							<DropdownMenuItem variant="destructive" onSelect={onRemove}>
								<Trans>Remove from channel</Trans>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
