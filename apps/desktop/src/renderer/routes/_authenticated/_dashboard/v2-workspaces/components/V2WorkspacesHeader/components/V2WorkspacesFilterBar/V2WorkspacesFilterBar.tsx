import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuCircleDot,
	LuFolder,
	LuGlobe,
	LuLaptop,
	LuListFilter,
	LuMonitor,
	LuTerminal,
	LuUsers,
	LuX,
} from "react-icons/lu";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import type {
	V2WorkspaceCreatorOption,
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useCurrentViewFilters } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useCurrentViewFilters";
import {
	EMPTY_VIEW_FILTERS,
	getViewFilters,
	isBuiltInView,
	MAX_SAVED_VIEWS,
	PROJECT_FILTER_SESSIONS,
	sameViewFilters,
	useV2WorkspacesFilterStore,
	WHERE_FILTER_ANYWHERE,
	WHERE_FILTER_CLOUD,
	WHERE_FILTER_THIS_DEVICE,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	BOARD_COLUMN_LABELS,
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { SaveViewPopover } from "../SaveViewPopover";
import { DeviceOptionLabel } from "./components/DeviceOptionLabel";
import { V2WorkspacesDisplayMenu } from "./components/V2WorkspacesDisplayMenu";

interface V2WorkspacesFilterBarProps {
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
	creatorOptions: V2WorkspaceCreatorOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<string, { projectName: string; iconUrl: string | null }>;
	/** Offers "Cloud" as a place; off when the org has no cloud workspaces. */
	cloudEnabled: boolean;
}

function toggleIn(values: string[], value: string): string[] {
	return values.includes(value)
		? values.filter((entry) => entry !== value)
		: [...values, value];
}

export function V2WorkspacesFilterBar({
	hostOptions,
	projectOptions,
	creatorOptions,
	hostsById,
	projectsById,
	cloudEnabled,
}: V2WorkspacesFilterBarProps) {
	const { t } = useLingui();
	const storedWhereFilter = useV2WorkspacesFilterStore(
		(state) => state.whereFilter,
	);
	const setWhereFilter = useV2WorkspacesFilterStore(
		(state) => state.setWhereFilter,
	);
	const projectFilters = useV2WorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const setProjectFilters = useV2WorkspacesFilterStore(
		(state) => state.setProjectFilters,
	);
	const creatorFilters = useV2WorkspacesFilterStore(
		(state) => state.creatorFilters,
	);
	const setCreatorFilters = useV2WorkspacesFilterStore(
		(state) => state.setCreatorFilters,
	);
	const statusFilters = useV2WorkspacesFilterStore(
		(state) => state.statusFilters,
	);
	const setStatusFilters = useV2WorkspacesFilterStore(
		(state) => state.setStatusFilters,
	);
	const showArchived = useV2WorkspacesFilterStore(
		(state) => state.showArchived,
	);
	const setShowArchived = useV2WorkspacesFilterStore(
		(state) => state.setShowArchived,
	);
	const activeViewId = useV2WorkspacesFilterStore(
		(state) => state.activeViewId,
	);
	const savedViews = useV2WorkspacesFilterStore((state) => state.savedViews);
	const currentFilters = useCurrentViewFilters();
	const resetToView = useV2WorkspacesFilterStore((state) => state.resetToView);
	const saveView = useV2WorkspacesFilterStore((state) => state.saveView);
	const saveAsNewView = useV2WorkspacesFilterStore(
		(state) => state.saveAsNewView,
	);
	const reset = useV2WorkspacesFilterStore((state) => state.reset);

	const remoteHosts = hostOptions.filter((host) => !host.isLocal);
	const localHostName = hostOptions.find((host) => host.isLocal)?.hostName;
	// A "Cloud" deep link in an org without cloud reads as Anywhere, which is
	// what the rows show (useAccessibleV2Workspaces falls back the same way).
	const whereFilter =
		storedWhereFilter === WHERE_FILTER_CLOUD && !cloudEnabled
			? WHERE_FILTER_ANYWHERE
			: storedWhereFilter;
	const whereLabel =
		whereFilter === WHERE_FILTER_THIS_DEVICE
			? (localHostName ?? t({ message: "This device" }))
			: whereFilter === WHERE_FILTER_CLOUD
				? t({ message: "Cloud" })
				: (remoteHosts.find((host) => host.hostId === whereFilter)?.hostName ??
					hostsById.get(whereFilter)?.hostName ??
					t({ message: "Unknown device" }));

	// A selected project can be absent from projectOptions (options derive from
	// currently visible rows); fall back to the full project map for its name.
	const projectNameFor = (value: string) =>
		value === PROJECT_FILTER_SESSIONS
			? t({ message: "Sessions" })
			: (projectOptions.find((project) => project.projectId === value)
					?.projectName ??
				projectsById.get(value)?.projectName ??
				t({ message: "Unknown project" }));
	const creatorNameFor = (userId: string) => {
		const creator = creatorOptions.find((entry) => entry.userId === userId);
		if (!creator) return t({ message: "Unknown person" });
		return creator.isCurrentUser
			? t({ message: `${creator.name} (you)` })
			: creator.name;
	};

	const isActiveViewBuiltIn = isBuiltInView(activeViewId);
	const isDirty = !sameViewFilters(
		currentFilters,
		getViewFilters(activeViewId, savedViews),
	);
	const hasAnyFilter = !sameViewFilters(currentFilters, EMPTY_VIEW_FILTERS);
	const isAtViewCap = savedViews.length >= MAX_SAVED_VIEWS;
	const viewCapTitle = t({ message: `Up to ${MAX_SAVED_VIEWS} saved views` });

	return (
		<div className="flex min-h-10 flex-wrap items-center gap-1.5 px-6 py-1">
			{whereFilter !== WHERE_FILTER_ANYWHERE ? (
				<FilterChip
					label={t({ message: `Host is ${whereLabel}` })}
					onRemove={() => setWhereFilter(WHERE_FILTER_ANYWHERE)}
				/>
			) : null}
			{projectFilters.map((projectId) => (
				<FilterChip
					key={projectId}
					label={t({ message: `Project is ${projectNameFor(projectId)}` })}
					onRemove={() =>
						setProjectFilters(toggleIn(projectFilters, projectId))
					}
				/>
			))}
			{creatorFilters.map((userId) => (
				<FilterChip
					key={userId}
					label={t({ message: `Creator is ${creatorNameFor(userId)}` })}
					onRemove={() => setCreatorFilters(toggleIn(creatorFilters, userId))}
				/>
			))}
			{statusFilters.map((column) => (
				<FilterChip
					key={column}
					label={t({
						message: `Status is ${i18n._(BOARD_COLUMN_LABELS[column])}`,
					})}
					onRemove={() =>
						setStatusFilters(statusFilters.filter((entry) => entry !== column))
					}
				/>
			))}
			{showArchived ? (
				<FilterChip
					label={t({ message: "Archived shown" })}
					onRemove={() => setShowArchived(false)}
				/>
			) : null}

			<DropdownMenu modal={false}>
				<DropdownMenuTrigger asChild>
					<ToolbarMenuButton
						isActive={hasAnyFilter}
						aria-label={t({ message: "Add a filter" })}
						className={cn(!hasAnyFilter && "-ml-3")}
					>
						<LuListFilter className="size-3.5" />
						<Trans>Filter</Trans>
					</ToolbarMenuButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-[14rem]">
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<span className="flex items-center gap-2">
								<LuGlobe className="size-3.5" />
								<Trans>Host</Trans>
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="min-w-[14rem]">
							<DropdownMenuRadioGroup
								value={whereFilter}
								onValueChange={setWhereFilter}
							>
								<DropdownMenuRadioItem value={WHERE_FILTER_ANYWHERE}>
									<DeviceOptionLabel
										icon={<LuGlobe className="size-3.5" />}
										label={t({ message: "Anywhere" })}
									/>
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value={WHERE_FILTER_THIS_DEVICE}>
									<DeviceOptionLabel
										icon={<LuLaptop className="size-3.5" />}
										label={
											localHostName
												? t({ message: `${localHostName} (this device)` })
												: t({ message: "This device" })
										}
									/>
								</DropdownMenuRadioItem>
								{cloudEnabled ? (
									<DropdownMenuRadioItem value={WHERE_FILTER_CLOUD}>
										<DeviceOptionLabel
											icon={<CloudGlyph className="size-3.5" />}
											label={t({ message: "Cloud" })}
										/>
									</DropdownMenuRadioItem>
								) : null}
								{remoteHosts.length > 0 ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
											<Trans>Other devices</Trans>
										</DropdownMenuLabel>
										{remoteHosts.map((host) => (
											<DropdownMenuRadioItem
												key={host.hostId}
												value={host.hostId}
											>
												<DeviceOptionLabel
													icon={<LuMonitor className="size-3.5" />}
													label={host.hostName}
													isOnline={host.isOnline}
												/>
											</DropdownMenuRadioItem>
										))}
									</>
								) : null}
							</DropdownMenuRadioGroup>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<span className="flex items-center gap-2">
								<LuFolder className="size-3.5" />
								<Trans>Project</Trans>
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="max-h-[60vh] min-w-[12rem] overflow-y-auto">
							{projectOptions.map((project) => (
								<DropdownMenuCheckboxItem
									indicator="end"
									key={project.projectId}
									checked={projectFilters.includes(project.projectId)}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={() =>
										setProjectFilters(
											toggleIn(projectFilters, project.projectId),
										)
									}
								>
									<span className="flex min-w-0 items-center gap-2">
										<V2WorkspaceProjectIcon
											projectName={project.projectName}
											iconUrl={project.iconUrl}
											size="sm"
										/>
										<span className="min-w-0 flex-1 truncate">
											{project.projectName}
										</span>
									</span>
								</DropdownMenuCheckboxItem>
							))}
							<DropdownMenuCheckboxItem
								indicator="end"
								checked={projectFilters.includes(PROJECT_FILTER_SESSIONS)}
								onSelect={(event) => event.preventDefault()}
								onCheckedChange={() =>
									setProjectFilters(
										toggleIn(projectFilters, PROJECT_FILTER_SESSIONS),
									)
								}
							>
								<span className="flex min-w-0 items-center gap-2">
									<LuTerminal className="size-3.5" />
									<Trans>Sessions</Trans>
								</span>
							</DropdownMenuCheckboxItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<span className="flex items-center gap-2">
								<LuUsers className="size-3.5" />
								<Trans>Creator</Trans>
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="max-h-[60vh] min-w-[12rem] overflow-y-auto">
							{creatorOptions.map((creator) => (
								<DropdownMenuCheckboxItem
									indicator="end"
									key={creator.userId}
									checked={creatorFilters.includes(creator.userId)}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={() =>
										setCreatorFilters(toggleIn(creatorFilters, creator.userId))
									}
								>
									<span className="flex min-w-0 items-center gap-2">
										<Avatar className="size-4">
											{creator.image ? (
												<AvatarImage src={creator.image} />
											) : null}
											<AvatarFallback className="text-[9px]">
												{creator.name.slice(0, 1).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="min-w-0 flex-1 truncate">
											{creatorNameFor(creator.userId)}
										</span>
									</span>
								</DropdownMenuCheckboxItem>
							))}
							{creatorOptions.length === 0 ? (
								<DropdownMenuLabel className="font-normal text-muted-foreground">
									<Trans>No known creators</Trans>
								</DropdownMenuLabel>
							) : null}
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<span className="flex items-center gap-2">
								<LuCircleDot className="size-3.5" />
								<Trans>Status</Trans>
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="min-w-[12rem]">
							{BOARD_COLUMN_ORDER.map((column: BoardColumnKey) => (
								<DropdownMenuCheckboxItem
									indicator="end"
									key={column}
									checked={statusFilters.includes(column)}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={() =>
										setStatusFilters(
											statusFilters.includes(column)
												? statusFilters.filter((entry) => entry !== column)
												: [...statusFilters, column],
										)
									}
								>
									<span className="flex min-w-0 items-center gap-2">
										<BoardColumnIcon column={column} />
										{i18n._(BOARD_COLUMN_LABELS[column])}
									</span>
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>

			{hasAnyFilter ? (
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground"
					onClick={() => reset()}
				>
					<Trans>Clear</Trans>
				</Button>
			) : null}

			<span className="ml-auto flex items-center gap-1">
				{isDirty ? (
					<>
						{isActiveViewBuiltIn ? (
							<SaveViewPopover
								onSave={saveAsNewView}
								trigger={
									<Button
										variant="outline"
										size="sm"
										disabled={isAtViewCap}
										title={isAtViewCap ? viewCapTitle : undefined}
									>
										<Trans>Save as view</Trans>
									</Button>
								}
							/>
						) : (
							<Button variant="outline" size="sm" onClick={() => saveView()}>
								<Trans>Save view</Trans>
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
							onClick={() => resetToView()}
						>
							<Trans>Reset</Trans>
						</Button>
					</>
				) : null}
				<V2WorkspacesDisplayMenu />
			</span>
			<span className="ml-0.5 flex h-full shrink-0">
				<WindowControlsInset />
			</span>
		</div>
	);
}

interface FilterChipProps {
	label: ReactNode;
	onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
	const { t } = useLingui();
	return (
		<span className="flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-border text-sm">
			<span className="flex max-w-[18rem] items-center truncate px-2 text-foreground">
				{label}
			</span>
			<button
				type="button"
				onClick={onRemove}
				aria-label={t({ message: "Remove filter" })}
				className="flex items-center px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<LuX className="size-3.5" />
			</button>
		</span>
	);
}
