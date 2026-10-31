import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import { LuCornerDownRight, LuHash } from "react-icons/lu";
import { PanelRow } from "../PanelRow";

type Dev = RouterOutputs["agent"]["get"];

/** Where people can reach the Dev: its DMs and the channels it is in. */
export function DevTalkToIt({ dev }: { dev: Dev }) {
	const navigate = useNavigate();
	return (
		<>
			<PanelRow
				icon={<LuCornerDownRight className="size-3.5" />}
				label={<Trans>Direct messages</Trans>}
			/>
			{dev.channels.map((channel) => (
				<PanelRow
					key={channel.id}
					role="link"
					tabIndex={0}
					className="cursor-pointer"
					onClick={() =>
						void navigate({
							to: "/channels/$channelId",
							params: { channelId: channel.id },
						})
					}
					icon={<LuHash className="size-3.5" />}
					label={channel.name}
					trailing={<Trans>Reads and posts</Trans>}
				/>
			))}
		</>
	);
}
