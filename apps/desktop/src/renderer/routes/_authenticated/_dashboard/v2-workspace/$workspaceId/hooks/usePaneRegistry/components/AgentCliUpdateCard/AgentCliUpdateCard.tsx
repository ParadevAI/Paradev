import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	CircleArrowUp,
	CircleCheck,
	LoaderCircle,
	TriangleAlert,
	X,
} from "lucide-react";
import type { ReactNode } from "react";

const ICONS = {
	available: CircleArrowUp,
	required: TriangleAlert,
	updating: LoaderCircle,
	updated: CircleCheck,
};

export type AgentCliUpdateCardState = keyof typeof ICONS;

export interface AgentCliUpdateCardAction {
	id: string;
	label: ReactNode;
	onClick?: () => void;
	href?: string;
	title?: string;
	disabled?: boolean;
}

const ACTION_CLASSNAME =
	"inline-flex h-6 shrink-0 items-center rounded-md px-2 font-medium text-[13px] text-popover-foreground/80 transition-colors hover:bg-popover-foreground/10 hover:text-popover-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-popover-foreground/35 disabled:pointer-events-none disabled:opacity-55";

/**
 * Where an agent CLI update is offered and followed: compact above the
 * composer, full size on the recovery screen.
 */
export function AgentCliUpdateCard({
	actions,
	className,
	compact = false,
	description,
	onDismiss,
	state,
	testId,
	title,
}: {
	state: AgentCliUpdateCardState;
	title: ReactNode;
	description?: ReactNode;
	actions: AgentCliUpdateCardAction[];
	onDismiss?: () => void;
	compact?: boolean;
	className?: string;
	testId?: string;
}) {
	const { t } = useLingui();
	const Icon = ICONS[state];
	const buttons = actions.map((action) =>
		action.href ? (
			<a
				className={ACTION_CLASSNAME}
				href={action.href}
				key={action.id}
				rel="noopener noreferrer"
				target="_blank"
				title={action.title}
			>
				{action.label}
			</a>
		) : (
			<button
				className={ACTION_CLASSNAME}
				disabled={action.disabled}
				key={action.id}
				onClick={action.onClick}
				title={action.title}
				type="button"
			>
				{action.label}
			</button>
		),
	);
	return (
		<div
			className={cn(
				"relative flex gap-2.5 border border-border bg-popover/95 text-[13px] text-popover-foreground leading-normal shadow-lg/10 backdrop-blur-xl dark:shadow-lg/15",
				compact
					? "items-center rounded-2xl py-2.5 pr-2 pl-3.5"
					: "items-start rounded-2xl py-3 pr-10 pl-3.5 text-left",
				className,
			)}
			data-testid={testId}
		>
			<Icon
				aria-hidden
				className={cn(
					"h-lh w-4 shrink-0 text-popover-foreground/90",
					state === "updating" &&
						"animate-spin opacity-90 motion-reduce:animate-none",
				)}
			/>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className={cn(compact && "truncate")}>{title}</div>
				{description && (
					<div
						className={cn(
							"text-popover-foreground/70",
							compact ? "truncate text-xs leading-5" : "text-pretty",
						)}
					>
						{description}
					</div>
				)}
				{!compact && buttons.length > 0 && (
					<div className="-ms-2 mt-1.5 flex flex-wrap items-center gap-0.5">
						{buttons}
					</div>
				)}
			</div>
			{compact && buttons}
			{onDismiss && (
				<button
					aria-label={t({ message: "Dismiss" })}
					className={cn(
						"flex size-6 shrink-0 items-center justify-center rounded-full text-popover-foreground/65 transition-colors hover:bg-popover-foreground/10 hover:text-popover-foreground",
						!compact && "absolute top-2 right-2",
					)}
					onClick={onDismiss}
					title={t({ message: "Dismiss" })}
					type="button"
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	);
}
