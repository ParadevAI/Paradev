import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef } from "react";
import { useHotkeyScopeStore } from "renderer/hotkeys";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";

export const inboxPillButton =
	"flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-fill-hover hover:text-foreground";

interface InboxCardShellProps {
	itemId: string;
	/** Overrides the inbox's own selection, for a row drawn outside the list. */
	selected?: boolean;
	/** A settled card reads as history. */
	dimmed?: boolean;
	icon: ReactNode;
	title: ReactNode;
	when: string;
	unread: boolean;
	/** Buttons shown over the time on hover or focus. */
	toolbar?: ReactNode;
	onOpen: () => void;
	children: ReactNode;
}

/** The frame every inbox row shares: icon, title, time, the hover toolbar, and the selected state. */
export function InboxCardShell({
	itemId,
	selected: selectedOverride,
	dimmed = false,
	icon,
	title,
	when,
	unread,
	toolbar,
	onOpen,
	children,
}: InboxCardShellProps) {
	const ref = useRef<HTMLElement>(null);
	const inList = useInboxSelectionStore((s) => s.selectedId === itemId);
	const selected = selectedOverride ?? inList;
	useEffect(() => {
		if (!selected || !ref.current) return;
		ref.current.scrollIntoView({ block: "nearest" });
		if (useHotkeyScopeStore.getState().active === "inbox") {
			ref.current.focus({ preventScroll: true });
		}
	}, [selected]);

	return (
		<article
			ref={ref}
			data-inbox-item={itemId}
			aria-current={selected ? "true" : undefined}
			tabIndex={selected ? 0 : -1}
			onClick={onOpen}
			onKeyDown={(event) => {
				if (event.target === event.currentTarget && event.key === "Enter")
					onOpen();
			}}
			className={cn(
				"group relative flex cursor-pointer flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-3 outline-none transition-colors hover:border-foreground/20",
				selected && "border-foreground/20 bg-fill-selected",
				dimmed && "opacity-70",
			)}
		>
			<div className="flex items-center gap-2">
				<span className="flex size-5 shrink-0 items-center justify-center self-start">
					{icon}
				</span>
				<span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-foreground">
					{title}
				</span>
				<span className="flex h-5 shrink-0 items-center self-start">
					<span
						className={cn(
							"flex items-center gap-1 text-[11px] text-muted-foreground transition-opacity duration-150",
							toolbar &&
								"group-hover:opacity-0 group-has-[:focus-visible]:opacity-0",
						)}
					>
						<span className="tabular-nums">{when}</span>
						{unread && (
							<>
								<span
									aria-hidden
									className="ml-0.5 size-1.5 rounded-full bg-sidebar-primary"
								/>
								<span className="sr-only">
									<Trans>Unread</Trans>
								</span>
							</>
						)}
					</span>
					{toolbar && (
						<div className="pointer-events-none absolute top-2 right-2 flex scale-95 items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 opacity-0 shadow-sm transition-[opacity,transform] duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100">
							{toolbar}
						</div>
					)}
				</span>
			</div>
			{children}
		</article>
	);
}
