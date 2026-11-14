import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronLeft,
	LuFolderOpen,
	LuGithub,
	LuLink,
	LuPlus,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { MenuItem } from "./components/MenuItem";

export interface CloneSource {
	url: string;
	label: string;
}

interface AddRepositoryMenuProps {
	hostUrl: string | null;
	disabled: boolean;
	selectedCloneUrls: string[];
	onAddLocal: () => void;
	onToggleClone: (source: CloneSource) => void;
}

type Page = "menu" | "github" | "url";

function repositoryLabel(url: string): string {
	return url
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.filter(Boolean)
		.slice(-2)
		.join("/");
}

/** Where a project's repositories come from: folders on this machine, GitHub, or a clone URL. */
export function AddRepositoryMenu({
	hostUrl,
	disabled,
	selectedCloneUrls,
	onAddLocal,
	onToggleClone,
}: AddRepositoryMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [page, setPage] = useState<Page>("menu");
	const [url, setUrl] = useState("");
	const repositoriesQuery = useQuery({
		queryKey: ["github-repositories", hostUrl],
		queryFn: () =>
			getHostServiceClientByUrl(
				hostUrl as string,
			).project.listGitHubRepositories.query(),
		enabled: open && page === "github" && hostUrl !== null,
		staleTime: 60_000,
	});

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setPage("menu");
			setUrl("");
		}
	};
	const addUrl = () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		onToggleClone({ url: trimmed, label: repositoryLabel(trimmed) });
		handleOpenChange(false);
	};
	const back = (
		<button
			type="button"
			onClick={() => setPage("menu")}
			aria-label={t({ message: "Back" })}
			className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<LuChevronLeft className="size-4" />
		</button>
	);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="w-full justify-between font-normal"
					disabled={disabled}
				>
					<span className="flex items-center gap-2">
						<LuPlus className="size-3.5" />
						<Trans>Add repository</Trans>
					</span>
					<LuChevronDown className="size-3.5 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
				onWheel={(event) => event.stopPropagation()}
			>
				{page === "menu" ? (
					<div className="flex flex-col p-1">
						<MenuItem
							icon={<LuFolderOpen className="size-4" />}
							onClick={() => {
								handleOpenChange(false);
								onAddLocal();
							}}
						>
							<Trans>Add from local</Trans>
						</MenuItem>
						<MenuItem
							icon={<LuGithub className="size-4" />}
							onClick={() => setPage("github")}
							more
							disabled={hostUrl === null}
						>
							<Trans>GitHub</Trans>
						</MenuItem>
						<MenuItem
							icon={<LuLink className="size-4" />}
							onClick={() => setPage("url")}
							more
						>
							<Trans>Clone from URL</Trans>
						</MenuItem>
					</div>
				) : page === "github" ? (
					<div className="animate-in fade-in-0 slide-in-from-right-8 duration-150">
						<Command>
							<CommandInput
								leading={back}
								autoFocus
								placeholder={t({ message: "Search repositories..." })}
							/>
							<CommandList className="max-h-64">
								<CommandEmpty>
									{repositoriesQuery.isLoading ? (
										<Trans>Loading repositories...</Trans>
									) : repositoriesQuery.isError ? (
										errorMessage(repositoriesQuery.error)
									) : (
										<Trans>No matches</Trans>
									)}
								</CommandEmpty>
								<CommandGroup>
									{(repositoriesQuery.data ?? []).map((repository) => (
										<CommandItem
											key={repository.fullName}
											value={repository.fullName}
											onSelect={() =>
												onToggleClone({
													url: repository.cloneUrl,
													label: repository.fullName,
												})
											}
										>
											<LuGithub className="size-4 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate">
												{repository.fullName}
											</span>
											{selectedCloneUrls.includes(repository.cloneUrl) && (
												<LuCheck className="size-4 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</div>
				) : (
					<div className="flex flex-col gap-2 p-2 animate-in fade-in-0 slide-in-from-right-8 duration-150">
						<div className="flex items-center gap-1">
							{back}
							<span className="text-sm font-medium">
								<Trans>Clone from URL</Trans>
							</span>
						</div>
						<div className="flex gap-1.5">
							<Input
								value={url}
								onChange={(event) => setUrl(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addUrl();
									}
								}}
								placeholder="https://github.com/owner/repo.git"
								className="flex-1 text-xs"
								autoFocus
							/>
							<Button
								type="button"
								size="sm"
								onClick={addUrl}
								disabled={!url.trim()}
							>
								<Trans>Add</Trans>
							</Button>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
