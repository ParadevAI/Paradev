import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";

type Dev = RouterOutputs["agent"]["get"];

interface DevIntroProps {
	dev: Dev;
	/** The pane beside the conversation already shows the face and name large; say it once, small. */
	compact?: boolean;
}

/** The top of a Dev's DM, where a channel shows its own intro. */
export function DevIntro({ dev, compact = false }: DevIntroProps) {
	const created = formatDate(new Date(dev.createdAt));
	if (compact) {
		return (
			<p className="flex items-center gap-2 px-4 pt-8 pb-4 text-[13px] text-muted-foreground">
				<DevAvatar avatar={dev.avatar} size={20} />
				<Trans>
					Your conversation with {dev.name}, since {created}.
				</Trans>
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2 px-4 pt-10 pb-4">
			<div className="flex items-center gap-3">
				<DevAvatar
					avatar={dev.avatar}
					size={48}
					alive
					mood={dev.pausedAt ? "asleep" : "idle"}
				/>
				<h2 className="truncate text-[26px] font-bold">{dev.name}</h2>
			</div>
			{dev.description && (
				<p className="text-[15px] text-muted-foreground">{dev.description}</p>
			)}
			<p className="text-[13px] text-muted-foreground">
				<Trans>Created {created}</Trans>
			</p>
		</div>
	);
}
