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
import { HiCheck, HiChevronUpDown, HiMiniPlus } from "react-icons/hi2";
import { LuContainer } from "react-icons/lu";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "../FormPickerTrigger";

export interface EnvironmentOption {
	id: string;
	name: string;
}

interface EnvironmentPickerPillProps {
	/** The explicit pick; undefined means Default. */
	selectedEnvironment: EnvironmentOption | undefined;
	environments: EnvironmentOption[];
	/**
	 * What Default resolves to for this project — an environment's name, or
	 * the repository a new one would be made for. Null when nothing can work
	 * for the project, so Default is not offered.
	 */
	defaultHint: string | null;
	/** Null picks Default. */
	onSelectEnvironment: (environmentId: string | null) => void;
	onCreateEnvironment: () => void;
	/** Shown when no environment carries the selected project's repository. */
	repositoryFullName?: string;
	isLoading?: boolean;
	/** No project is picked: Default would be a cloud session, which can't start yet. */
	isSessionUnavailable?: boolean;
}

export function EnvironmentPickerPill({
	selectedEnvironment,
	environments,
	defaultHint,
	onSelectEnvironment,
	onCreateEnvironment,
	repositoryFullName,
	isLoading = false,
	isSessionUnavailable = false,
}: EnvironmentPickerPillProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const offersDefault = defaultHint !== null;
	const isDefault = offersDefault && selectedEnvironment === undefined;
	const needsSetup =
		!isSessionUnavailable &&
		!isLoading &&
		!offersDefault &&
		environments.length === 0;
	const pick = (environmentId: string | null) => {
		onSelectEnvironment(environmentId);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[140px]">
					{needsSetup ? (
						<HiMiniPlus className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<LuContainer className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="truncate">
						{selectedEnvironment?.name ??
							(isDefault || isSessionUnavailable
								? t({ message: "Default" })
								: needsSetup
									? t({ message: "Set up environment" })
									: t({ message: "Select environment" }))}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className={`w-64 p-0 ${FORM_PICKER_MENU_CLASS}`}
				onWheel={(event) => event.stopPropagation()}
			>
				{isSessionUnavailable ? (
					<div className="p-1">
						<div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
							<LuContainer className="size-4" />
							<span className="flex-1">
								<Trans>Default</Trans>
							</span>
						</div>
						<p className="px-2 pt-1 pb-1.5 text-xs leading-snug text-muted-foreground">
							<Trans>
								Cloud workspaces without a project are coming. Pick a project
								for now.
							</Trans>
						</p>
					</div>
				) : (
					<Command>
						<CommandInput
							placeholder={t({
								message: "Search environments...",
							})}
						/>
						<CommandList className="max-h-[min(280px,var(--radix-popover-content-available-height))]">
							<CommandEmpty className="px-3 py-3 text-center text-xs text-muted-foreground">
								{needsSetup && repositoryFullName ? (
									<Trans>No environment for {repositoryFullName}</Trans>
								) : needsSetup ? (
									<Trans>No environments yet</Trans>
								) : (
									<Trans>No environments found.</Trans>
								)}
							</CommandEmpty>
							{(offersDefault || environments.length > 0) && (
								<CommandGroup>
									{offersDefault && (
										<CommandItem onSelect={() => pick(null)} value="default">
											<LuContainer className="size-4 text-muted-foreground" />
											<span className="flex-1">
												<Trans>Default</Trans>
											</span>
											{isDefault && <HiCheck className="size-4 shrink-0" />}
										</CommandItem>
									)}
									{environments.map((environment) => (
										<CommandItem
											key={environment.id}
											value={environment.name}
											onSelect={() => pick(environment.id)}
										>
											<LuContainer className="size-4 text-muted-foreground" />
											<span className="flex-1 truncate">
												{environment.name}
											</span>
											{environment.id === selectedEnvironment?.id && (
												<HiCheck className="size-4 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
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
									<Trans>New environment</Trans>
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				)}
			</PopoverContent>
		</Popover>
	);
}
