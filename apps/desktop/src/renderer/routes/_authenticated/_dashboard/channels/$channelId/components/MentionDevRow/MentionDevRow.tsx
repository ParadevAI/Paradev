import type { DevAvatar as DevAvatarLook } from "@superset/shared/dev-avatar";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { DevBadge } from "../DevBadge";

interface MentionDevRowProps {
	name: string;
	avatar: DevAvatarLook;
}

/** A Dev in the @ menu, laid out like a person's row. */
export function MentionDevRow({ name, avatar }: MentionDevRowProps) {
	return (
		<>
			<DevAvatar avatar={avatar} size={20} />
			<span className="truncate font-semibold">{name}</span>
			<DevBadge />
		</>
	);
}
