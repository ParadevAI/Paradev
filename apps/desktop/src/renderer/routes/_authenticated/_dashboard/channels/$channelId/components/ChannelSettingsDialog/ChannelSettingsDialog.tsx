import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { CHANNEL_DESCRIPTION_MAX_LENGTH } from "@superset/shared/channels";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelProjectSelect } from "../ChannelProjectSelect";

type Visibility = "public" | "private";

interface ChannelSettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	channel: {
		id: string;
		name: string;
		description: string | null;
		visibility: Visibility;
		taskProjectId: string | null;
	};
}

export function ChannelSettingsDialog({
	open,
	onOpenChange,
	channel,
}: ChannelSettingsDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const [name, setName] = useState(channel.name);
	const [description, setDescription] = useState(channel.description ?? "");
	const [visibility, setVisibility] = useState<Visibility>(channel.visibility);
	const [projectId, setProjectId] = useState(channel.taskProjectId);
	const update = cloudTrpc.channel.update.useMutation({
		onSuccess: () => {
			void utils.channel.invalidate();
			onOpenChange(false);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Channel settings</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						update.mutate({
							channelId: channel.id,
							name,
							description: description.trim() || null,
							visibility,
							taskProjectId: projectId,
						});
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="channel-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="channel-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="channel-description">
							<Trans>Description</Trans>
						</Label>
						<Input
							id="channel-description"
							value={description}
							maxLength={CHANNEL_DESCRIPTION_MAX_LENGTH}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>
							<Trans>Visibility</Trans>
						</Label>
						<Select
							value={visibility}
							onValueChange={(value) => setVisibility(value as Visibility)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="public">
									{t({ message: "Public" })}
								</SelectItem>
								<SelectItem value="private">
									{t({ message: "Private" })}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>
							<Trans>Project</Trans>
						</Label>
						<ChannelProjectSelect value={projectId} onChange={setProjectId} />
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={update.isPending || !name.trim()}>
							<Trans>Save</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
