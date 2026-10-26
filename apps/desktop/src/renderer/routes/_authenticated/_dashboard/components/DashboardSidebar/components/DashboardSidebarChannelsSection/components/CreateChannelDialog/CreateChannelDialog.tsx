import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { normalizeChannelName } from "@superset/shared/channels";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelNameInput } from "renderer/routes/_authenticated/_dashboard/components/ChannelNameInput";

type Visibility = "public" | "private";

interface CreateChannelDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Slack's create flow: name the channel, then choose who can see it. */
export function CreateChannelDialog({
	open,
	onOpenChange,
}: CreateChannelDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const { data: organizations } = cloudTrpc.organization.list.useQuery();
	const organizationName =
		organizations?.find((organization) => organization.id === organizationId)
			?.name ?? "";
	const [step, setStep] = useState<1 | 2>(1);
	const [name, setName] = useState("");
	const [visibility, setVisibility] = useState<Visibility>("public");

	const reset = () => {
		setStep(1);
		setName("");
		setVisibility("public");
	};
	const close = (next: boolean) => {
		onOpenChange(next);
		if (!next) reset();
	};

	const create = cloudTrpc.channel.create.useMutation({
		onSuccess: (channel) => {
			void utils.channel.list.invalidate();
			close(false);
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
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-xl">
						<Trans>Create a channel</Trans>
					</DialogTitle>
					{step === 2 && (
						<p className="text-sm text-muted-foreground"># {normalized}</p>
					)}
				</DialogHeader>
				{step === 1 ? (
					<form
						className="flex flex-col gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (normalized) setStep(2);
						}}
					>
						<Label htmlFor="new-channel-name">
							<Trans>Name</Trans>
						</Label>
						<ChannelNameInput
							id="new-channel-name"
							value={name}
							onChange={setName}
							placeholder={t({ message: "e.g. plan-budget" })}
						/>
						<div className="mt-6 flex items-center justify-between">
							<span className="text-sm text-muted-foreground">
								<Trans>Step 1 of 2</Trans>
							</span>
							<Button type="submit" disabled={!normalized}>
								<Trans>Next</Trans>
							</Button>
						</div>
					</form>
				) : (
					<form
						className="flex flex-col gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							if (!organizationId || !normalized) return;
							create.mutate({
								organizationId,
								name: normalized,
								visibility,
							});
						}}
					>
						<Label>
							<Trans>Visibility</Trans>
						</Label>
						<RadioGroup
							value={visibility}
							onValueChange={(value) => setVisibility(value as Visibility)}
							className="gap-3"
						>
							<label
								htmlFor="new-channel-public"
								className="flex items-center gap-2.5 text-sm"
							>
								<RadioGroupItem id="new-channel-public" value="public" />
								<span>
									<Trans>
										Public — anyone in{" "}
										<span className="font-semibold">{organizationName}</span>
									</Trans>
								</span>
							</label>
							<label
								htmlFor="new-channel-private"
								className="flex items-start gap-2.5 text-sm"
							>
								<RadioGroupItem
									id="new-channel-private"
									value="private"
									className="mt-0.5"
								/>
								<span className="flex flex-col">
									<Trans>Private — only specific people</Trans>
									<span className="text-muted-foreground">
										<Trans>Can only be viewed or joined by invitation</Trans>
									</span>
								</span>
							</label>
						</RadioGroup>
						<div className="mt-6 flex items-center justify-between">
							<span className="text-sm text-muted-foreground">
								<Trans>Step 2 of 2</Trans>
							</span>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setStep(1)}
								>
									<Trans>Back</Trans>
								</Button>
								<Button type="submit" disabled={create.isPending}>
									<Trans>Create</Trans>
								</Button>
							</div>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
