import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { LuChevronDown, LuCornerDownRight, LuHash } from "react-icons/lu";
import { useUpdateDev } from "../../hooks/useUpdateDev";
import { PanelRow } from "../PanelRow";

type Dev = RouterOutputs["agent"]["get"];

/** Where people can reach the Dev: its DMs and the channels it is in. */
export function DevTalkToIt({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const update = useUpdateDev();
	const access = {
		organization: t({ message: "Anyone" }),
		creator: t({ message: "Only its creator" }),
	};

	return (
		<>
			<PanelRow
				icon={<LuCornerDownRight className="size-3.5" />}
				label={<Trans>Direct messages</Trans>}
				trailing={
					dev.canManage ? (
						<DropdownMenu>
							<DropdownMenuTrigger className="flex items-center gap-1 rounded-sm hover:text-foreground">
								{access[dev.messageAccess]}
								<LuChevronDown className="size-3" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{(["organization", "creator"] as const).map((value) => (
									<DropdownMenuItem
										key={value}
										onSelect={() =>
											update.mutate({ agentId: dev.id, messageAccess: value })
										}
									>
										{access[value]}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						access[dev.messageAccess]
					)
				}
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
