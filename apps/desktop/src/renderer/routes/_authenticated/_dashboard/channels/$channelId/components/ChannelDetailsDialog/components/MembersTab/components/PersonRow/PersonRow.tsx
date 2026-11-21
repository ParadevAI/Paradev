import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { PresenceAvatar } from "../../../../../PresenceAvatar";

interface PersonRowProps {
	userId: string;
	name: string;
	email: string;
	image: string | null;
	isSelf: boolean;
	trailing: ReactNode;
}

export function PersonRow({
	userId,
	name,
	email,
	image,
	isSelf,
	trailing,
}: PersonRowProps) {
	return (
		<div className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1">
			<PresenceAvatar
				userId={userId}
				name={name}
				image={image}
				size="md"
				ringClassName="ring-background"
			/>
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-1 truncate text-sm">
					<span className="truncate">{name}</span>
					{isSelf && (
						<span className="shrink-0 text-muted-foreground">
							<Trans>(you)</Trans>
						</span>
					)}
				</p>
				<p className="truncate text-xs text-muted-foreground">{email}</p>
			</div>
			{trailing}
		</div>
	);
}
