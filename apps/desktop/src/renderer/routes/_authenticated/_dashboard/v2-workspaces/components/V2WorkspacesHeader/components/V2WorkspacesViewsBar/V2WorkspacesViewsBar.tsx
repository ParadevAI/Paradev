import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuBookmark, LuPlus, LuX } from "react-icons/lu";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	BUILT_IN_VIEW_NEEDS_ME,
	BUILT_IN_VIEW_WORKING,
	MAX_SAVED_VIEWS,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { SaveViewPopover } from "../SaveViewPopover";

interface V2WorkspacesViewsBarProps {
	/** Offers the "Cloud" view; off when the org has no cloud workspaces. */
	cloudEnabled: boolean;
}

const VIEW_BUTTON_CLASS =
	"flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors";

export function V2WorkspacesViewsBar({
	cloudEnabled,
}: V2WorkspacesViewsBarProps) {
	const { t } = useLingui();
	const activeViewId = useV2WorkspacesFilterStore(
		(state) => state.activeViewId,
	);
	const savedViews = useV2WorkspacesFilterStore((state) => state.savedViews);
	const applyView = useV2WorkspacesFilterStore((state) => state.applyView);
	const deleteView = useV2WorkspacesFilterStore((state) => state.deleteView);
	const saveAsNewView = useV2WorkspacesFilterStore(
		(state) => state.saveAsNewView,
	);

	const isAtViewCap = savedViews.length >= MAX_SAVED_VIEWS;

	// Arrow keys move between tabs, as a tablist is expected to.
	const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		const tabs = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
		);
		const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
		if (index === -1) return;
		event.preventDefault();
		const step = event.key === "ArrowRight" ? 1 : -1;
		tabs[(index + step + tabs.length) % tabs.length]?.focus();
	};

	const builtInViews = [
		{ id: BUILT_IN_VIEW_ALL, label: t({ message: "All" }) },
		{ id: BUILT_IN_VIEW_NEEDS_ME, label: t({ message: "Needs me" }) },
		{ id: BUILT_IN_VIEW_WORKING, label: t({ message: "Working" }) },
		...(cloudEnabled
			? [{ id: BUILT_IN_VIEW_CLOUD, label: t({ message: "Cloud" }) }]
			: []),
	];

	const viewButton = (
		view: { id: string; label: string },
		isSaved: boolean,
	) => {
		const isActive = view.id === activeViewId;
		return (
			<span key={view.id} className="flex shrink-0 items-center">
				<button
					type="button"
					role="tab"
					aria-selected={isActive}
					onClick={() => applyView(view.id)}
					className={cn(
						VIEW_BUTTON_CLASS,
						isActive
							? "border-border bg-muted text-foreground"
							: "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
						isSaved && isActive && "rounded-r-none border-r-0",
					)}
				>
					{isSaved ? (
						<LuBookmark
							className={cn(
								"size-3",
								isActive ? "text-primary" : "text-muted-foreground/70",
							)}
						/>
					) : null}
					<span className="max-w-[12rem] truncate">{view.label}</span>
				</button>
				{isSaved && isActive ? (
					<button
						type="button"
						onClick={() => deleteView(view.id)}
						aria-label={t({ message: `Delete view ${view.label}` })}
						className={cn(
							VIEW_BUTTON_CLASS,
							"rounded-l-none border-border bg-muted px-1.5 text-muted-foreground hover:text-foreground",
						)}
					>
						<LuX className="size-3" />
					</button>
				) : null}
			</span>
		);
	};

	return (
		<div
			role="tablist"
			aria-label={t({ message: "Workspace views" })}
			onKeyDown={handleTablistKeyDown}
			className="flex h-11 items-center gap-1 border-t border-border/60 px-6 overflow-x-auto hide-scrollbar"
		>
			{builtInViews.map((view) => viewButton(view, false))}
			{savedViews.length > 0 ? (
				<>
					<span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
					{savedViews.map((view) =>
						viewButton({ id: view.id, label: view.name }, true),
					)}
				</>
			) : null}
			<span className="flex-1" />
			<SaveViewPopover
				onSave={saveAsNewView}
				trigger={
					<button
						type="button"
						disabled={isAtViewCap}
						title={
							isAtViewCap
								? t({ message: `Up to ${MAX_SAVED_VIEWS} saved views` })
								: undefined
						}
						className={cn(
							VIEW_BUTTON_CLASS,
							"-mr-2.5 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent",
						)}
					>
						<LuPlus className="size-3.5" />
						<Trans>New view</Trans>
					</button>
				}
			/>
			<span className="ml-1 flex h-full shrink-0">
				<WindowControlsInset />
			</span>
		</div>
	);
}
