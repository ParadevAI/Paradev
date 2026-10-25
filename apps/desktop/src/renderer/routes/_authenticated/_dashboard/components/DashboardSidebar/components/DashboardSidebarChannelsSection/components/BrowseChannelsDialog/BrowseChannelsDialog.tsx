import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { LuHash } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface BrowseChannelsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function BrowseChannelsDialog({
	open,
	onOpenChange,
}: BrowseChannelsDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const { data: channels = [] } = cloudTrpc.channel.browse.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: open && organizationId !== null },
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 sm:max-w-lg">
				<DialogTitle className="sr-only">
					<Trans>Browse channels</Trans>
				</DialogTitle>
				<Command>
					<CommandInput placeholder={t({ message: "Search channels" })} />
					<CommandList className="max-h-96">
						<CommandEmpty>
							<Trans>No channels found</Trans>
						</CommandEmpty>
						{channels.map((channel) => (
							<CommandItem
								key={channel.id}
								value={`${channel.name} ${channel.id}`}
								onSelect={() => {
									onOpenChange(false);
									void navigate({
										to: "/channels/$channelId",
										params: { channelId: channel.id },
									});
								}}
								className="flex items-start gap-2 py-2"
							>
								<LuHash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium">
										{channel.name}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{channel.joined && (
											<>
												<Trans>Joined</Trans>
												{" · "}
											</>
										)}
										<Plural
											value={channel.memberCount}
											one="# member"
											other="# members"
										/>
										{channel.description && ` · ${channel.description}`}
									</div>
								</div>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
