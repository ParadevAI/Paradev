import { Trans, useLingui } from "@lingui/react/macro";
import type { Dev } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PluginIcon } from "renderer/components/PluginIcon";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface DevPluginsDialogProps {
	dev: Dev;
	onOpenChange: (open: boolean) => void;
	/** Resolves to whether it saved. */
	onSave: (patch: {
		paradevAccess: boolean;
		plugins: string[];
	}) => Promise<boolean>;
}

/**
 * What a Dev may use as its owner: Paradev itself and the owner's installed
 * plugins, each with a switch. Nothing is on until the owner says so.
 */
export function DevPluginsDialog({
	dev,
	onOpenChange,
	onSave,
}: DevPluginsDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [paradevAccess, setParadevAccess] = useState(
		dev.paradevAccess ?? false,
	);
	const [plugins, setPlugins] = useState(dev.plugins ?? []);
	const [isBusy, setBusy] = useState(false);
	const installed = cloudTrpc.plugins.list
		.useQuery(undefined, { staleTime: 60_000 })
		.data?.filter(
			(plugin) =>
				plugin.installed && plugin.enabled && plugin.name !== "superset",
		);
	const save = async () => {
		if (isBusy) return;
		setBusy(true);
		const isSaved = await onSave({ paradevAccess, plugins });
		setBusy(false);
		if (isSaved) onOpenChange(false);
	};
	const row = (
		key: string,
		icon: string,
		label: string,
		detail: string | null,
		isOn: boolean,
		onChange: (isOn: boolean) => void,
	) => (
		<label
			key={key}
			htmlFor={`dev-plugin-${key}`}
			className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-fill-hover"
		>
			<PluginIcon pluginName={icon} className="size-6" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-sm">{label}</span>
				{detail && (
					<span className="truncate text-muted-foreground text-xs">
						{detail}
					</span>
				)}
			</span>
			<Switch
				id={`dev-plugin-${key}`}
				checked={isOn}
				onCheckedChange={onChange}
			/>
		</label>
	);
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Plugins for {dev.name}</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							What it can use as you. It uses your accounts, also when someone
							else asks it in a group.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto">
					{row(
						"paradev",
						"superset",
						"Paradev",
						t({ message: "Start workspaces and coding agents" }),
						paradevAccess,
						setParadevAccess,
					)}
					{installed?.map((plugin) =>
						row(
							plugin.name,
							plugin.name,
							plugin.displayName,
							plugin.accounts[0] ?? null,
							plugins.includes(plugin.name),
							(isOn) =>
								setPlugins((current) =>
									isOn
										? [...current, plugin.name]
										: current.filter((name) => name !== plugin.name),
								),
						),
					)}
				</div>
				<div className="flex items-center justify-between gap-3">
					<Button
						type="button"
						variant="ghost"
						className="text-muted-foreground"
						onClick={() => {
							onOpenChange(false);
							void navigate({ to: "/plugins" });
						}}
					>
						<Trans>Get more plugins</Trans>
					</Button>
					<Button disabled={isBusy} onClick={() => void save()}>
						<Trans>Save</Trans>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
