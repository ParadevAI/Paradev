import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import {
	HiCheck,
	HiChevronUpDown,
	HiMiniPlus,
	HiOutlineCog6Tooth,
} from "react-icons/hi2";
import { LuContainer } from "react-icons/lu";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "../FormPickerTrigger";

export interface EnvironmentOption {
	id: string;
	name: string;
	scope?: "organization" | "personal";
}

interface EnvironmentPickerPillProps {
	selectedEnvironment: EnvironmentOption | undefined;
	linked: EnvironmentOption[];
	other: EnvironmentOption[];
	projectName?: string;
	onSelectEnvironment: (environmentId: string) => void;
	onCreateEnvironment: () => void;
	onManageEnvironments: () => void;
	isLoading?: boolean;
}

export function EnvironmentPickerPill({
	selectedEnvironment,
	linked,
	other,
	projectName,
	onSelectEnvironment,
	onCreateEnvironment,
	onManageEnvironments,
	isLoading = false,
}: EnvironmentPickerPillProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const needsSetup = !isLoading && linked.length === 0 && other.length === 0;
	const pick = (environmentId: string) => {
		onSelectEnvironment(environmentId);
		setOpen(false);
	};
	const renderItem = (environment: EnvironmentOption) => (
		<CommandItem
			key={environment.id}
			value={`${environment.name} ${environment.id}`}
			onSelect={() => pick(environment.id)}
		>
			<LuContainer className="size-4 text-muted-foreground" />
			<span className="flex-1 truncate">{environment.name}</span>
			{environment.scope === "personal" && (
				<span className="text-[10px] text-muted-foreground">
					<Trans>Only you</Trans>
				</span>
			)}
			{environment.id === selectedEnvironment?.id && (
				<HiCheck className="size-4 shrink-0" />
			)}
		</CommandItem>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[160px]">
					{needsSetup ? (
						<HiMiniPlus className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<LuContainer className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="truncate">
						{selectedEnvironment?.name ??
							(isLoading ? (
								<span className="inline-block h-2.5 w-14 rounded-sm bg-muted-foreground/15 align-middle animate-pulse" />
							) : needsSetup ? (
								t({ message: "Create environment" })
							) : (
								t({ message: "Select environment" })
							))}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className={`w-72 p-0 ${FORM_PICKER_MENU_CLASS}`}
				onWheel={(event) => event.stopPropagation()}
			>
				<Command>
					<CommandInput
						placeholder={t({
							message: "Search environments...",
						})}
					/>
					<CommandList className="max-h-[min(320px,var(--radix-popover-content-available-height))]">
						<CommandEmpty className="px-3 py-3 text-center text-xs text-muted-foreground">
							<Trans>No environments found.</Trans>
						</CommandEmpty>
						{projectName && (
							<CommandGroup
								forceMount={linked.length === 0}
								heading={t({ message: `Linked to ${projectName}` })}
							>
								{linked.length === 0 ? (
									<p className="px-2 pt-0.5 pb-1.5 text-xs leading-snug text-muted-foreground">
										<Trans>
											No environments are linked to this project yet.
										</Trans>
									</p>
								) : (
									linked.map(renderItem)
								)}
							</CommandGroup>
						)}
						{other.length > 0 && (
							<>
								{projectName && <CommandSeparator />}
								<CommandGroup
									heading={
										projectName
											? t({ message: "Other environments" })
											: undefined
									}
								>
									{other.map(renderItem)}
								</CommandGroup>
							</>
						)}
						<CommandSeparator alwaysRender />
						<CommandGroup forceMount>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onCreateEnvironment();
								}}
							>
								<HiMiniPlus className="size-4" />
								<Trans>Create environment</Trans>
							</CommandItem>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onManageEnvironments();
								}}
							>
								<HiOutlineCog6Tooth className="size-4" />
								<Trans>Manage environments</Trans>
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
