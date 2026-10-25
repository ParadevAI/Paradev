import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	CHANNEL_DESCRIPTION_MAX_LENGTH,
	CHANNEL_NAME_MAX_LENGTH,
	normalizeChannelName,
} from "@superset/shared/channels";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface CreateChannelDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateChannelDialog({
	open,
	onOpenChange,
}: CreateChannelDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isPrivate, setPrivate] = useState(false);
	const create = cloudTrpc.channel.create.useMutation({
		onSuccess: (channel) => {
			void utils.channel.list.invalidate();
			onOpenChange(false);
			setName("");
			setDescription("");
			setPrivate(false);
			void navigate({
				to: "/channels/$channelId",
				params: { channelId: channel.id },
			});
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't create the channel" })),
			),
	});
	const normalized = normalizeChannelName(name);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Create a channel</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!organizationId || !normalized) return;
						create.mutate({
							organizationId,
							name: normalized,
							description: description.trim() || null,
							visibility: isPrivate ? "private" : "public",
						});
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-channel-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="new-channel-name"
							autoFocus
							value={name}
							maxLength={CHANNEL_NAME_MAX_LENGTH}
							placeholder={t({ message: "e.g. design-review" })}
							onChange={(event) =>
								setName(event.target.value.toLowerCase().replace(/\s/g, "-"))
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-channel-description">
							<Trans>Description</Trans>
						</Label>
						<Input
							id="new-channel-description"
							value={description}
							maxLength={CHANNEL_DESCRIPTION_MAX_LENGTH}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</div>
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="new-channel-private">
							<Trans>Make private</Trans>
						</Label>
						<Switch
							id="new-channel-private"
							checked={isPrivate}
							onCheckedChange={setPrivate}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={!normalized || create.isPending}>
							<Trans>Create</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
