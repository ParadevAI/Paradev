import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuHash,
	LuLock,
	LuPlus,
} from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The channel a task is discussed in; picking another moves it there. */
export function ChannelProperty({ taskId }: { taskId: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const [open, setOpen] = useState(false);
	const { data: channel = null } = cloudTrpc.channelTask.forTask.useQuery({
		taskId,
	});
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const options = {
		onSettled: () => {
			void utils.channelTask.forTask.invalidate({ taskId });
			void utils.channelTask.list.invalidate();
			void utils.taskRecord.timeline.invalidate({ taskId });
		},
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const add = cloudTrpc.channelTask.add.useMutation(options);
	const remove = cloudTrpc.channelTask.remove.useMutation(options);
	const joined = channels.filter((option) => option.isMember);

	const select = (channelId: string | null) => {
		setOpen(false);
		if (channelId === (channel?.id ?? null)) return;
		if (channelId) add.mutate({ channelId, taskId });
		else if (channel) remove.mutate({ channelId: channel.id, taskId });
	};
	const Icon = channel?.visibility === "private" ? LuLock : LuHash;

	return (
		<div className="flex min-w-0 items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="-mx-1 inline-flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
					>
						{channel ? (
							<>
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate">{channel.name}</span>
							</>
						) : (
							<>
								<LuPlus className="size-3.5 text-muted-foreground" />
								<Trans>Add to channel</Trans>
							</>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-64 p-0">
					<Command>
						<CommandInput
							autoFocus
							placeholder={t({ message: "Set channel…" })}
						/>
						<CommandList>
							<CommandEmpty>
								<Trans>No channels</Trans>
							</CommandEmpty>
							<CommandGroup>
								<CommandItem value="__none" onSelect={() => select(null)}>
									<span className="flex-1 text-muted-foreground">
										<Trans>No channel</Trans>
									</span>
									{!channel && <LuCheck className="size-3.5" />}
								</CommandItem>
								{joined.map((option) => {
									const OptionIcon =
										option.visibility === "private" ? LuLock : LuHash;
									return (
										<CommandItem
											key={option.id}
											value={option.id}
											keywords={[option.name]}
											onSelect={() => select(option.id)}
										>
											<OptionIcon className="size-3.5 text-muted-foreground" />
											<span className="flex-1 truncate">{option.name}</span>
											{channel?.id === option.id && (
												<LuCheck className="size-3.5" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
			{channel && (
				<button
					type="button"
					aria-label={t({ message: "Open channel" })}
					onClick={() =>
						void navigate({
							to: "/channels/$channelId",
							params: { channelId: channel.id },
						})
					}
					className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuArrowUpRight className="size-3.5" />
				</button>
			)}
		</div>
	);
}
