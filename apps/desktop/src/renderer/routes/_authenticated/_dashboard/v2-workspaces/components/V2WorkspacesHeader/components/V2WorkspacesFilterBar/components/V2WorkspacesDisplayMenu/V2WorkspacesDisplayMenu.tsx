import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuSettings2 } from "react-icons/lu";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesGroupBy,
	type V2WorkspacesOrderBy,
	type V2WorkspacesViewMode,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

const MENU_LABEL_CLASS =
	"text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";

/** Layout, grouping, ordering, and whether archived rows show at all. */
export function V2WorkspacesDisplayMenu() {
	const { t } = useLingui();
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const setViewMode = useV2WorkspacesFilterStore((state) => state.setViewMode);
	const groupBy = useV2WorkspacesFilterStore((state) => state.groupBy);
	const setGroupBy = useV2WorkspacesFilterStore((state) => state.setGroupBy);
	const orderBy = useV2WorkspacesFilterStore((state) => state.orderBy);
	const setOrderBy = useV2WorkspacesFilterStore((state) => state.setOrderBy);
	const showArchived = useV2WorkspacesFilterStore(
		(state) => state.showArchived,
	);
	const setShowArchived = useV2WorkspacesFilterStore(
		(state) => state.setShowArchived,
	);

	const groupings: Array<{ value: V2WorkspacesGroupBy; label: string }> = [
		{ value: "status", label: t({ message: "Status" }) },
		{ value: "project", label: t({ message: "Project" }) },
		{ value: "where", label: t({ message: "Host" }) },
		{ value: "creator", label: t({ message: "Creator" }) },
		{ value: "none", label: t({ message: "No grouping" }) },
	];
	const orderings: Array<{ value: V2WorkspacesOrderBy; label: string }> = [
		{ value: "activity", label: t({ message: "Last agent message" }) },
		{ value: "created", label: t({ message: "Created" }) },
		{ value: "name", label: t({ message: "Name" }) },
	];

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<ToolbarMenuButton
					aria-label={t({ message: "Display options" })}
					className="-mr-2"
				>
					<LuSettings2 className="size-3.5" />
					<span className="@max-2xl:hidden">
						<Trans>Display</Trans>
					</span>
				</ToolbarMenuButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[13rem]">
				<DropdownMenuLabel className={MENU_LABEL_CLASS}>
					<Trans>Layout</Trans>
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={viewMode}
					onValueChange={(value) => setViewMode(value as V2WorkspacesViewMode)}
				>
					<DropdownMenuRadioItem value="list">
						<Trans>List</Trans>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="board">
						<Trans>Board</Trans>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				{/* The board's columns are the status buckets, so it has no
				    grouping to choose. */}
				{viewMode === "list" ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className={MENU_LABEL_CLASS}>
							<Trans>Grouping</Trans>
						</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={groupBy}
							onValueChange={(value) =>
								setGroupBy(value as V2WorkspacesGroupBy)
							}
						>
							{groupings.map((option) => (
								<DropdownMenuRadioItem key={option.value} value={option.value}>
									{option.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</>
				) : null}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className={MENU_LABEL_CLASS}>
					<Trans>Ordering</Trans>
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={orderBy}
					onValueChange={(value) => setOrderBy(value as V2WorkspacesOrderBy)}
				>
					{orderings.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={showArchived}
					onSelect={(event) => event.preventDefault()}
					onCheckedChange={(checked) => setShowArchived(checked === true)}
				>
					<Trans>Show archived</Trans>
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
