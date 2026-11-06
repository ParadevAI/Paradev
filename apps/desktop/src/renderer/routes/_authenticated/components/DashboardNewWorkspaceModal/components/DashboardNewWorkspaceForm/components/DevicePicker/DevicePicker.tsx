import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	HiCheck,
	HiOutlineComputerDesktop,
	HiOutlineServer,
} from "react-icons/hi2";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "../../PromptGroup/components/FormPickerTrigger";
import { PickerChevron } from "../PickerChevron";
import { useWorkspaceHostOptions } from "./hooks/useWorkspaceHostOptions";

function OnlineDot({ online }: { online: boolean }) {
	const { t } = useLingui();
	return (
		<span
			role="img"
			aria-label={
				online
					? t({
							message: "online",
						})
					: t({
							message: "offline",
						})
			}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}

interface DevicePickerProps {
	hostId: string | null;
	onSelectHostId: (hostId: string | null) => void;
	className?: string;
	/**
	 * Also show relay connectivity for the local device. Cloud-dispatched work
	 * (automations) goes through the relay, so "local" is not inherently online.
	 */
	showLocalOnlineState?: boolean;
	/**
	 * Disables opening via the Radix trigger itself. A button disabled only
	 * through an enclosing <fieldset> still receives pointerdown in Chrome —
	 * the event that opens a DropdownMenu.
	 */
	disabled?: boolean;
	/** False on surfaces that can only launch on a host. */
	offersCloud?: boolean;
}

function getSelectedIcon(
	hostId: string | null,
	machineId: string | null,
	className: string,
) {
	if (hostId === CLOUD_HOST_ID) {
		return <CloudGlyph className={className} />;
	}
	if (hostId === null || hostId === machineId) {
		return <HiOutlineComputerDesktop className={className} />;
	}
	return <HiOutlineServer className={className} />;
}

export function DevicePicker({
	hostId,
	onSelectHostId,
	className,
	showLocalOnlineState = false,
	disabled,
	offersCloud = true,
}: DevicePickerProps) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const isParadevShell = useParadevShell();
	const { currentDeviceName, localHostIsOnline, otherHosts } =
		useWorkspaceHostOptions();
	const isLocal = hostId === null || hostId === machineId;
	const selectedLabel =
		hostId === CLOUD_HOST_ID
			? t({
					message: "Cloud",
				})
			: isLocal
				? (currentDeviceName ??
					t({
						message: "Local Device",
					}))
				: (otherHosts.find((host) => host.id === hostId)?.name ??
					t({
						message: "Unknown Host",
					}));
	// For direct (local) use the app itself is the host, so it's tautologically
	// online and gets no indicator. Relay-dispatched contexts opt into showing
	// the local device's relay connectivity instead.
	const localOnline = showLocalOnlineState ? localHostIsOnline : null;
	const isCloud = hostId === CLOUD_HOST_ID;
	const selectedOnline = isLocal
		? localOnline
		: isCloud
			? null
			: (otherHosts.find((host) => host.id === hostId)?.isOnline ?? false);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<FormPickerTrigger
					className={cn("max-w-[140px]", className)}
					aria-label={t({
						message: `Device: ${selectedLabel}`,
					})}
					title={selectedLabel}
				>
					{getSelectedIcon(
						hostId,
						machineId,
						isParadevShell ? "size-3.5 shrink-0" : "size-4 shrink-0",
					)}
					<span className="truncate">{selectedLabel}</span>
					{selectedOnline !== null && <OnlineDot online={selectedOnline} />}
					<PickerChevron />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className={cn("w-72", FORM_PICKER_MENU_CLASS)}
			>
				<DropdownMenuItem onSelect={() => onSelectHostId(machineId)}>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">
						<Trans>Local Device</Trans>
					</span>
					{localOnline !== null && <OnlineDot online={localOnline} />}
					{isLocal && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{offersCloud && (cloudEnabled || isCloud) && (
					<DropdownMenuItem onSelect={() => onSelectHostId(CLOUD_HOST_ID)}>
						<CloudGlyph className="size-4" />
						<span className="flex-1">
							<Trans>Cloud</Trans>
						</span>
						{isCloud && <HiCheck className="size-4" />}
					</DropdownMenuItem>
				)}
				{otherHosts.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<HiOutlineServer className="size-4" />
								<Trans>Other Hosts</Trans>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent
								className={cn("w-72", FORM_PICKER_MENU_CLASS)}
							>
								{otherHosts.map((host) => {
									const isSelected = hostId === host.id;

									return (
										<DropdownMenuItem
											key={host.id}
											onSelect={() => onSelectHostId(host.id)}
										>
											<HiOutlineServer className="size-4" />
											<span className="min-w-0 truncate">{host.name}</span>
											{host.isOnline && host.version && (
												<span
													className={cn(
														"ml-auto shrink-0 font-mono text-[10px] tabular-nums",
														host.versionState === "incompatible"
															? "text-destructive"
															: host.versionState === "behind"
																? "text-amber-600 dark:text-amber-400"
																: "text-muted-foreground/60",
													)}
												>
													{host.versionState === "incompatible"
														? t({ message: "needs update" })
														: host.versionState === "behind"
															? t({ message: `${host.version} · behind` })
															: host.version}
												</span>
											)}
											<OnlineDot online={host.isOnline} />
											{isSelected && (
												<HiCheck className="ml-auto size-4 shrink-0" />
											)}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
