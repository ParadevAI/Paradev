import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { type ReactNode, useEffect, useState } from "react";
import { GoGitBranch, GoGlobe } from "react-icons/go";
import { HiCheck } from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";
import { PLATFORM } from "renderer/hotkeys";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { BranchFilter, BranchRow } from "../../../hooks/useBranchContext";

const MOD_KEY = PLATFORM === "mac" ? "⌘" : "Ctrl";

interface BranchCommandProps {
	branches: BranchRow[];
	defaultBranch: string | null | undefined;
	selectedBranch: string | null;
	search: string;
	onSearchChange: (value: string) => void;
	filter: BranchFilter;
	onFilterChange: (filter: BranchFilter) => void;
	isLoading: boolean;
	isError: boolean;
	failure: ReactNode;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	onSelect: (branch: BranchRow) => void;
	/** Shows each row's "Open workspace" action, also on Mod+Enter. */
	onOpenWorkspace?: (branch: BranchRow) => void;
}

/** A searchable, paged branch list, mounted inside an open picker. */
export function BranchCommand({
	branches,
	defaultBranch,
	selectedBranch,
	search,
	onSearchChange,
	filter,
	onFilterChange,
	isLoading,
	isError,
	failure,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	onSelect,
	onOpenWorkspace,
}: BranchCommandProps) {
	const { t } = useLingui();
	// Mirror cmdk's selected row so Mod+Enter can resolve it without DOM lookup.
	const [selectedValue, setSelectedValue] = useState("");
	const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!hasNextPage || isFetchingNextPage || !sentinel) return;
		// Guard against cascade: when isFetchingNextPage flips false → effect
		// re-runs → observer reattaches → if sentinel is still in the root
		// margin (e.g. tall viewport, small page), the callback fires again
		// immediately. Re-checking the latest fetch state avoids loading every
		// remaining page in one chain.
		let inFlight = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (inFlight) return;
				if (entries.some((e) => e.isIntersecting)) {
					inFlight = true;
					onLoadMore();
				}
			},
			{ rootMargin: "64px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, sentinel, onLoadMore]);

	return (
		<Command
			shouldFilter={false}
			value={selectedValue}
			onValueChange={setSelectedValue}
			onKeyDown={(e) => {
				// cmdk leaves focus on the input, so the per-row button is
				// pointer-only — Mod+Enter is the keyboard path to it.
				if (onOpenWorkspace && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
					const selected = branches.find(
						(branch) => branch.name === selectedValue,
					);
					if (!selected) return;
					e.preventDefault();
					e.stopPropagation();
					onOpenWorkspace(selected);
				}
			}}
		>
			<CommandInput
				placeholder={t({
					message: "Search branches...",
				})}
				value={search}
				onValueChange={onSearchChange}
			/>
			<Tabs
				value={filter}
				onValueChange={(v) => onFilterChange(v as BranchFilter)}
				className="p-2"
			>
				<TabsList className="grid w-full grid-cols-2 h-7 bg-transparent">
					<TabsTrigger value="all" className="text-[11px]">
						<Trans>All</Trans>
					</TabsTrigger>
					<TabsTrigger value="worktree" className="text-[11px]">
						<Trans>Worktree</Trans>
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<CommandList className="max-h-[420px]">
				{!isLoading && !isError && branches.length === 0 && (
					<CommandEmpty>
						<Trans>No branches found</Trans>
					</CommandEmpty>
				)}
				{branches.map((branch) => {
					const isRemoteOnly = branch.isRemote && !branch.isLocal;
					const isWorktree = Boolean(branch.worktreePath);
					return (
						<CommandItem
							key={branch.name}
							value={branch.name}
							onSelect={() => onSelect(branch)}
							className="group items-start gap-3 rounded-md px-2.5 py-2"
						>
							{isWorktree ? (
								<LuFolderOpen className="mt-0.5 size-4 shrink-0 text-primary/80" />
							) : isRemoteOnly ? (
								<GoGlobe className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
							) : (
								<GoGitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							)}
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate text-sm leading-snug">
									{branch.name}
								</span>
								<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									{branch.lastCommitDate > 0 && (
										<span>
											{formatRelativeTime(branch.lastCommitDate * 1000)}
										</span>
									)}
									{branch.name === defaultBranch && (
										<>
											<span aria-hidden>·</span>
											<span>
												<Trans>default</Trans>
											</span>
										</>
									)}
									{isRemoteOnly && (
										<>
											<span aria-hidden>·</span>
											<span>
												<Trans>remote</Trans>
											</span>
										</>
									)}
									{isWorktree && (
										<>
											<span aria-hidden>·</span>
											<span className="text-primary/80">
												<Trans>worktree</Trans>
											</span>
										</>
									)}
								</span>
							</div>
							<span className="ml-2 flex shrink-0 items-center gap-1.5 self-center">
								{onOpenWorkspace && (
									<button
										type="button"
										className="hidden items-center rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 group-hover:inline-flex group-data-[selected=true]:inline-flex"
										onClick={(e) => {
											e.stopPropagation();
											onOpenWorkspace(branch);
										}}
									>
										<Trans>Open workspace</Trans>
										<span className="ml-1.5 text-[10px] opacity-70">
											{MOD_KEY}↵
										</span>
									</button>
								)}
								{selectedBranch === branch.name && (
									<HiCheck
										className={
											onOpenWorkspace
												? "size-4 text-primary group-hover:hidden group-data-[selected=true]:hidden"
												: "size-4 text-primary"
										}
									/>
								)}
							</span>
						</CommandItem>
					);
				})}
				{isError ? (
					<div className="flex justify-center py-2">{failure}</div>
				) : (
					hasNextPage && (
						<div
							ref={setSentinel}
							className="py-2 text-center text-[11px] text-muted-foreground/60"
						>
							{isFetchingNextPage ? <Trans>Loading more...</Trans> : ""}
						</div>
					)
				)}
			</CommandList>
		</Command>
	);
}
