import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuChevronDown,
	LuFolder,
	LuGlobe,
	LuLaptop,
	LuList,
	LuMonitor,
	LuSquareKanban,
	LuTerminal,
	LuUsers,
} from "react-icons/lu";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type {
	V2WorkspaceCreatorOption,
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	PROJECT_FILTER_SESSIONS,
	useV2WorkspacesFilterStore,
	WHERE_FILTER_ANYWHERE,
	WHERE_FILTER_CLOUD,
	WHERE_FILTER_THIS_DEVICE,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { V2WorkspaceProjectIcon } from "../V2WorkspaceProjectIcon";
import { DeviceOptionLabel } from "./components/DeviceOptionLabel";

interface V2WorkspacesHeaderProps {
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

export function V2WorkspacesHeader({
	hostOptions,
	projectOptions,
	creatorOptions,
	hostsById,
	projectsById,
	cloudEnabled,
}: V2WorkspacesHeaderProps) {
	const { t } = useLingui();
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const setSearchQuery = useV2WorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);
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
	const showArchived = useV2WorkspacesFilterStore(
		(state) => state.showArchived,
	);
	const setShowArchived = useV2WorkspacesFilterStore(
		(state) => state.setShowArchived,
	);
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const setViewMode = useV2WorkspacesFilterStore((state) => state.setViewMode);
	const openNewWorkspace = useOpenNewWorkspace();

	const remoteHosts = hostOptions.filter((host) => !host.isLocal);
	const localHostName = hostOptions.find((host) => host.isLocal)?.hostName;
	// A "Cloud" deep link in an org without cloud reads as Anywhere, which is
	// what the rows show (useAccessibleV2Workspaces falls back the same way).
	const whereFilter =
		storedWhereFilter === WHERE_FILTER_CLOUD && !cloudEnabled
			? WHERE_FILTER_ANYWHERE
			: storedWhereFilter;
	// The title names the actual machine ("Avi's Mac"), not the abstract
	// "This device" — that phrasing stays in the menu where it's a choice.
	const whereLabel =
		whereFilter === WHERE_FILTER_ANYWHERE
			? t({ message: "Anywhere" })
			: whereFilter === WHERE_FILTER_THIS_DEVICE
				? (localHostName ??
					t({
						message: "This device",
					}))
				: whereFilter === WHERE_FILTER_CLOUD
					? t({ message: "Cloud" })
					: (remoteHosts.find((host) => host.hostId === whereFilter)
							?.hostName ??
						hostsById.get(whereFilter)?.hostName ??
						t({
							message: "Unknown device",
						}));
	const whereIcon =
		whereFilter === WHERE_FILTER_ANYWHERE ? (
			<LuGlobe className="size-4 text-muted-foreground" />
		) : whereFilter === WHERE_FILTER_THIS_DEVICE ? (
			<LuLaptop className="size-4 text-muted-foreground" />
		) : whereFilter === WHERE_FILTER_CLOUD ? (
			<CloudGlyph className="size-4 text-muted-foreground" />
		) : (
			<LuMonitor className="size-4 text-muted-foreground" />
		);

	const projectFilterOptions = [
		...projectOptions.map((project) => ({
			value: project.projectId,
			label: project.projectName,
			icon: (
				<V2WorkspaceProjectIcon
					projectName={project.projectName}
					iconUrl={project.iconUrl}
					size="sm"
				/>
			),
		})),
		{
			value: PROJECT_FILTER_SESSIONS,
			label: t({
				message: "Sessions",
			}),
			icon: <LuTerminal className="size-3.5" />,
		},
	];

	// A selected project can be absent from projectOptions (options derive from
	// currently visible rows); fall back to the full project map for its name.
	const projectNameFor = (value: string) =>
		value === PROJECT_FILTER_SESSIONS
			? t({ message: "Sessions" })
			: (projectOptions.find((project) => project.projectId === value)
					?.projectName ??
				projectsById.get(value)?.projectName ??
				t({
					message: "Unknown project",
				}));
	const projectFilterLabel =
		projectFilters.length === 0
			? t({
					message: "In all projects",
				})
			: projectFilters.length === 1
				? projectNameFor(projectFilters[0])
				: t({
						message: plural(projectFilters.length, {
							one: "# project",
							other: "# projects",
						}),
					});
	const singleProjectFilter =
		projectFilters.length === 1 ? projectFilters[0] : null;
	const singleProjectIconUrl =
		singleProjectFilter && singleProjectFilter !== PROJECT_FILTER_SESSIONS
			? (projectOptions.find(
					(project) => project.projectId === singleProjectFilter,
				)?.iconUrl ??
				projectsById.get(singleProjectFilter)?.iconUrl ??
				null)
			: null;

	const creatorNameFor = (creator: V2WorkspaceCreatorOption) =>
		creator.isCurrentUser
			? t({
					message: `${creator.name} (you)`,
				})
			: creator.name;
	const singleCreator =
		creatorFilters.length === 1
			? creatorOptions.find((creator) => creator.userId === creatorFilters[0])
			: undefined;
	const creatorFilterLabel =
		creatorFilters.length === 0
			? t({ message: "Anyone" })
			: creatorFilters.length === 1
				? singleCreator
					? creatorNameFor(singleCreator)
					: t({ message: "1 person" })
				: t({
						message: plural(creatorFilters.length, {
							one: "# person",
							other: "# people",
						}),
					});

	const toggleIn = (values: string[], value: string) =>
		values.includes(value)
			? values.filter((entry) => entry !== value)
			: [...values, value];

	return (
		<div
			data-workspaces-toolbar
			className="@container shrink-0 border-b border-border px-6 pb-2"
		>
			<PageHeader
				className="-mx-6 mb-1"
				contentClassName="gap-3 px-6"
				start={
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								aria-label={t({
									message: "Filter by where workspaces run",
								})}
								className="-ml-2 h-9 gap-2 px-2 text-lg font-semibold"
							>
								{whereIcon}
								<span className="min-w-0 truncate">{whereLabel}</span>
								<LuChevronDown className="size-4 text-muted-foreground" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-[14rem]">
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
												? t({
														message: `${localHostName} (this device)`,
													})
												: t({
														message: "This device",
													})
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
						</DropdownMenuContent>
					</DropdownMenu>
				}
				end={
					<Button
						size="sm"
						className="h-8 shrink-0"
						onClick={() => openNewWorkspace()}
					>
						<Trans>Create workspace</Trans>
					</Button>
				}
			/>

			<div className="flex flex-wrap items-center justify-between gap-2">
				{/* Bare icon+placeholder on the page background; -ml-3 puts the
				    magnifier on the same 24px rail as the title icon and rows. */}
				<WorkItemsSearch
					value={searchQuery}
					onChange={setSearchQuery}
					placeholder={t({
						message: "Search workspaces…",
					})}
					label={t({
						message: "Search workspaces",
					})}
					className="bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
					containerClassName="-ml-3"
				/>

				<div className="flex min-w-0 items-center gap-2 overflow-x-auto hide-scrollbar">
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<ToolbarMenuButton isActive={projectFilters.length > 0}>
								{singleProjectFilter === PROJECT_FILTER_SESSIONS ? (
									<LuTerminal className="size-3.5" />
								) : singleProjectFilter ? (
									<V2WorkspaceProjectIcon
										projectName={projectFilterLabel}
										iconUrl={singleProjectIconUrl}
										size="sm"
										className="size-4 text-[9px]"
									/>
								) : (
									<LuFolder className="size-3.5" />
								)}
								<span className="max-w-[12rem] truncate @max-2xl:max-w-20">
									{projectFilterLabel}
								</span>
								<LuChevronDown className="size-3 opacity-60" />
							</ToolbarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="max-h-[60vh] min-w-[12rem] overflow-y-auto"
						>
							{projectFilterOptions.map((option) => (
								<DropdownMenuCheckboxItem
									indicator="end"
									key={option.value}
									checked={projectFilters.includes(option.value)}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={() =>
										setProjectFilters(toggleIn(projectFilters, option.value))
									}
								>
									<span className="flex min-w-0 items-center gap-2">
										{option.icon}
										<span className="min-w-0 flex-1 truncate">
											{option.label}
										</span>
									</span>
								</DropdownMenuCheckboxItem>
							))}
							{projectFilters.length > 0 ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="justify-center text-xs text-muted-foreground"
										onSelect={() => setProjectFilters([])}
									>
										<Trans>All projects</Trans>
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<ToolbarMenuButton isActive={creatorFilters.length > 0}>
								{singleCreator ? (
									<Avatar className="size-4">
										{singleCreator.image ? (
											<AvatarImage src={singleCreator.image} />
										) : null}
										<AvatarFallback className="text-[9px]">
											{singleCreator.name.slice(0, 1).toUpperCase()}
										</AvatarFallback>
									</Avatar>
								) : (
									<LuUsers className="size-3.5" />
								)}
								<span className="max-w-[12rem] truncate @max-2xl:max-w-20">
									{creatorFilterLabel}
								</span>
								<LuChevronDown className="size-3 opacity-60" />
							</ToolbarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="max-h-[60vh] min-w-[12rem] overflow-y-auto"
						>
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
											{creatorNameFor(creator)}
										</span>
									</span>
								</DropdownMenuCheckboxItem>
							))}
							{creatorOptions.length === 0 ? (
								<DropdownMenuItem disabled>
									<Trans>No known creators</Trans>
								</DropdownMenuItem>
							) : null}
							{creatorFilters.length > 0 ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="justify-center text-xs text-muted-foreground"
										onSelect={() => setCreatorFilters([])}
									>
										<Trans>Anyone</Trans>
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="h-4 w-px shrink-0 bg-border" />

					<ToolbarMenuButton
						isActive={showArchived}
						aria-label={t({ message: "Show archived" })}
						aria-pressed={showArchived}
						onClick={() => setShowArchived(!showArchived)}
					>
						<LuArchive className="size-3.5" />
						{/* Narrow containers keep the icon; the words go. */}
						<span className="@max-2xl:hidden">
							<Trans>Show archived</Trans>
						</span>
					</ToolbarMenuButton>

					{/* Matches TasksTopBar's TabsList treatment (borderless muted pill). */}
					<fieldset
						className="flex h-8 shrink-0 items-center rounded-md bg-muted/50 p-0.5"
						aria-label={t({
							message: "Workspace layout",
						})}
					>
						<button
							type="button"
							aria-label={t({ message: "List" })}
							aria-pressed={viewMode === "list"}
							className={cn(
								"flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
								viewMode === "list"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setViewMode("list")}
						>
							<LuList className="size-3.5" />
							<span className="@max-2xl:hidden">
								<Trans>List</Trans>
							</span>
						</button>
						<button
							type="button"
							aria-label={t({ message: "Board" })}
							aria-pressed={viewMode === "board"}
							className={cn(
								"flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
								viewMode === "board"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setViewMode("board")}
						>
							<LuSquareKanban className="size-3.5" />
							<span className="@max-2xl:hidden">
								<Trans>Board</Trans>
							</span>
						</button>
					</fieldset>
				</div>
			</div>
		</div>
	);
}
