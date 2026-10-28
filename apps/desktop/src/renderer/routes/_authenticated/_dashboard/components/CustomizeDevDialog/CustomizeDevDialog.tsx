import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	DEV_AVATAR_COLORS,
	DEV_AVATAR_EYES,
	DEV_AVATAR_SHAPE_NAMES,
	type DevAvatar as DevAvatarLook,
	randomDevAvatar,
} from "@superset/shared/dev-avatar";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuDices } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DevAvatar } from "../DevAvatar";
import { randomDevName } from "./random-dev-name";

interface CustomizeDevDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The Dev to edit; without it the dialog creates one. */
	dev?: { id: string; name: string; avatar: DevAvatarLook };
}

export function CustomizeDevDialog({
	open,
	onOpenChange,
	dev,
}: CustomizeDevDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				{open && (
					<CustomizeDevForm dev={dev} onDone={() => onOpenChange(false)} />
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Mounts with each opening, so a refetch behind the dialog never resets what you picked. */
function CustomizeDevForm({
	dev,
	onDone,
}: {
	dev: CustomizeDevDialogProps["dev"];
	onDone: () => void;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const [name, setName] = useState(() => dev?.name ?? randomDevName());
	const [avatar, setAvatar] = useState<DevAvatarLook>(
		() => dev?.avatar ?? randomDevAvatar(),
	);

	const onError = (error: unknown) =>
		toast.error(errorMessage(error, t({ message: "Couldn't save the Dev" })));
	const create = cloudTrpc.agent.create.useMutation({
		onSuccess: (created) => {
			void utils.agent.list.invalidate();
			onDone();
			void navigate({ to: "/devs/$devId", params: { devId: created.id } });
		},
		onError,
	});
	const update = cloudTrpc.agent.update.useMutation({
		onSuccess: () => {
			void utils.agent.invalidate();
			onDone();
		},
		onError,
	});
	const trimmed = name.trim();
	const devName = dev?.name;
	const pending = create.isPending || update.isPending;

	const save = () => {
		if (!trimmed) return;
		if (dev) {
			update.mutate({ agentId: dev.id, name: trimmed, avatar });
		} else if (organizationId) {
			create.mutate({ organizationId, name: trimmed, avatar });
		}
	};

	const option = (selected: boolean) =>
		cn(
			"flex h-14 items-center justify-center rounded-xl border transition-colors",
			selected
				? "border-foreground bg-accent"
				: "border-transparent hover:bg-accent",
		);

	return (
		<>
			<DialogHeader>
				<DialogTitle className="text-xl">
					{dev ? (
						<Trans>Customize {devName}</Trans>
					) : (
						<Trans>Create a Dev</Trans>
					)}
				</DialogTitle>
			</DialogHeader>
			<form
				className="grid grid-cols-[1fr_280px] gap-6"
				onSubmit={(event) => {
					event.preventDefault();
					save();
				}}
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="dev-name">
							<Trans>Name</Trans>
						</Label>
						<div className="flex h-10 items-center gap-2 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-ring/50">
							<input
								id="dev-name"
								value={name}
								maxLength={80}
								onChange={(event) => setName(event.target.value)}
								className="min-w-0 flex-1 bg-transparent text-sm outline-none"
							/>
							<button
								type="button"
								aria-label={t({ message: "Surprise me" })}
								onClick={() => {
									setAvatar(randomDevAvatar());
									if (!dev) setName(randomDevName());
								}}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								<LuDices className="size-4" />
							</button>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>
							<Trans>Shape</Trans>
						</Label>
						<div className="grid grid-cols-5 gap-2">
							{DEV_AVATAR_SHAPE_NAMES.map((shape) => (
								<button
									key={shape}
									type="button"
									aria-label={shape}
									aria-pressed={avatar.shape === shape}
									onClick={() => setAvatar({ ...avatar, shape })}
									className={option(avatar.shape === shape)}
								>
									<DevAvatar avatar={{ ...avatar, shape }} size={40} alive />
								</button>
							))}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>
							<Trans>Eyes</Trans>
						</Label>
						<div className="grid grid-cols-5 gap-2">
							{DEV_AVATAR_EYES.map((eyes) => (
								<button
									key={eyes}
									type="button"
									aria-label={eyes}
									aria-pressed={avatar.eyes === eyes}
									onClick={() => setAvatar({ ...avatar, eyes })}
									className={option(avatar.eyes === eyes)}
								>
									<DevAvatar avatar={{ ...avatar, eyes }} size={40} alive />
								</button>
							))}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>
							<Trans>Color</Trans>
						</Label>
						<div className="flex flex-wrap gap-2.5">
							{DEV_AVATAR_COLORS.map((color) => (
								<button
									key={color}
									type="button"
									aria-label={color}
									aria-pressed={avatar.color === color}
									onClick={() => setAvatar({ ...avatar, color })}
									className={cn(
										"size-7 rounded-full outline-2 outline-offset-2",
										avatar.color === color
											? "outline outline-foreground"
											: "outline-transparent",
									)}
									style={{ background: color }}
								/>
							))}
						</div>
					</div>
				</div>
				<div className="flex flex-col justify-between gap-4">
					<div className="flex h-64 items-center justify-center rounded-2xl bg-foreground/[0.04]">
						<DevAvatar avatar={avatar} size={168} alive />
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={onDone}>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={!trimmed || pending}>
							{dev ? <Trans>Save</Trans> : <Trans>Create</Trans>}
						</Button>
					</div>
				</div>
			</form>
		</>
	);
}
