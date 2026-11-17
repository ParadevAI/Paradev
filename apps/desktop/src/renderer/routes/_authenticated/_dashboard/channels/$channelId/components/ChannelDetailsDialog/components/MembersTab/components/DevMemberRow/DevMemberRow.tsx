import type { DevAvatar as DevAvatarLook } from "@superset/shared/dev-avatar";
import type { ReactNode } from "react";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { DevBadge } from "../../../../../DevBadge";

interface DevMemberRowProps {
	name: string;
	avatar: DevAvatarLook;
	trailing: ReactNode;
}

export function DevMemberRow({ name, avatar, trailing }: DevMemberRowProps) {
	return (
		<div className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1">
			<DevAvatar avatar={avatar} size={32} />
			<p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
				<span className="truncate">{name}</span>
				<DevBadge />
			</p>
			{trailing}
		</div>
	);
}
