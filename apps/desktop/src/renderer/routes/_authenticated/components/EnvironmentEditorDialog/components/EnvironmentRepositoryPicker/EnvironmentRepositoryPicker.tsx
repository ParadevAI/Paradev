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
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiMiniPlus, HiMiniXMark } from "react-icons/hi2";
import { LuRefreshCw } from "react-icons/lu";

interface RepositoryOption {
	id: string;
	fullName: string;
}

interface EnvironmentRepositoryPickerProps {
	repositories: RepositoryOption[];
	selected: RepositoryOption[];
	onToggle: (repositoryId: string) => void;
	isLoading: boolean;
	disabled: boolean;
	onConfigureGitHubApp: (() => void) | null;
	onRefresh: (() => void) | null;
	isRefreshing: boolean;
}

/**
 * The chosen repositories as removable chips, and an Add button whose search
 * list opens below it.
 */
export function EnvironmentRepositoryPicker({
	repositories,
	selected,
	onToggle,
	isLoading,
	disabled,
	onConfigureGitHubApp,
	onRefresh,
	isRefreshing,
}: EnvironmentRepositoryPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const selectedIds = new Set(selected.map((repository) => repository.id));
	const addable = repositories.filter(
		(repository) => !selectedIds.has(repository.id),
	);

	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-2">
			{selected.map((repository) => {
				const repositoryName = repository.fullName;
				return (
					<span
						className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/60 pr-1 pl-2 text-xs"
						key={repository.id}
					>
						<FaGithub className="size-3 shrink-0 text-muted-foreground" />
						<span className="truncate">{repository.fullName}</span>
						{!disabled && (
							<button
								aria-label={t({ message: `Remove ${repositoryName}` })}
								className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
								onClick={() => onToggle(repository.id)}
								type="button"
							>
								<HiMiniXMark className="size-3" />
							</button>
						)}
					</span>
				);
			})}
			{!disabled && (
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>
						<button
							className={cn(
								"inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
								open && "bg-muted/60 text-foreground",
							)}
							id="environment-repositories"
							type="button"
						>
							<HiMiniPlus className="size-3.5" />
							{selected.length === 0 ? (
								<Trans>Add repository</Trans>
							) : (
								<Trans>Add</Trans>
							)}
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						avoidCollisions={false}
						className="w-72 p-0"
						side="bottom"
					>
						<Command>
							<CommandInput
								className="text-xs"
								placeholder={t({ message: "Search repositories..." })}
							/>
							<CommandList className="max-h-56">
								<CommandEmpty className="px-3 py-3 text-center text-xs text-muted-foreground">
									{isLoading ? (
										<Trans>Loading repositories...</Trans>
									) : onConfigureGitHubApp ? (
										<Trans>No matching repositories.</Trans>
									) : (
										<Trans>
											No repositories. Connect GitHub in Integrations, then
											refresh.
										</Trans>
									)}
								</CommandEmpty>
								{addable.length > 0 && (
									<CommandGroup>
										{addable.map((repository) => (
											<CommandItem
												className="rounded-md text-xs"
												key={repository.id}
												onSelect={() => {
													onToggle(repository.id);
													setOpen(false);
												}}
												value={repository.fullName}
											>
												<FaGithub className="size-3.5 text-muted-foreground" />
												<span className="flex-1 truncate">
													{repository.fullName}
												</span>
											</CommandItem>
										))}
									</CommandGroup>
								)}
								{(onRefresh || onConfigureGitHubApp) && (
									<>
										<CommandSeparator alwaysRender />
										<CommandGroup forceMount>
											{onRefresh && (
												<CommandItem
													className="rounded-md text-xs"
													disabled={isRefreshing}
													forceMount
													onSelect={onRefresh}
												>
													<LuRefreshCw
														className={cn(
															"size-3.5",
															isRefreshing && "animate-spin",
														)}
													/>
													<Trans>Refresh repositories</Trans>
												</CommandItem>
											)}
											{onConfigureGitHubApp && (
												<CommandItem
													className="rounded-md text-xs"
													forceMount
													onSelect={() => {
														setOpen(false);
														onConfigureGitHubApp();
													}}
												>
													<FaGithub className="size-3.5" />
													<Trans>Configure GitHub App…</Trans>
												</CommandItem>
											)}
										</CommandGroup>
									</>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
