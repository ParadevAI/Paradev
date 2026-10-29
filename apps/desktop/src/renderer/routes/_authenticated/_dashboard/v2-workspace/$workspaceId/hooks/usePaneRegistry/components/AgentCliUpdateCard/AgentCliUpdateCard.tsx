import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	CircleCheck,
	Download,
	LoaderCircle,
	TriangleAlert,
	X,
} from "lucide-react";
import type { ReactNode } from "react";

const ICONS = {
	available: Download,
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
	primary?: boolean;
}

const ACTION_CLASSNAME =
	"shrink-0 rounded-md px-2 py-0.5 font-medium text-popover-foreground/80 transition-colors hover:bg-popover-foreground/10 hover:text-popover-foreground disabled:pointer-events-none disabled:opacity-50";

/**
 * Where an agent CLI update is offered and followed: compact above the
 * composer, full size on the recovery screen.
 */
export function AgentCliUpdateCard({
	actions,
	className,
	compact = false,
	description,
	detail,
	onDismiss,
	state,
	testId,
	title,
}: {
	state: AgentCliUpdateCardState;
	title: ReactNode;
	description?: ReactNode;
	/** Shown in mono under the description, such as the update command. */
	detail?: ReactNode;
	actions: AgentCliUpdateCardAction[];
	onDismiss?: () => void;
	compact?: boolean;
	className?: string;
	testId?: string;
}) {
	const { t } = useLingui();
	const Icon = ICONS[state];
	const buttons = actions.map((action) => {
		const actionClassName = cn(
			ACTION_CLASSNAME,
			action.primary && "bg-popover-foreground/10 text-popover-foreground",
		);
		return action.href ? (
			<a
				className={actionClassName}
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
				className={actionClassName}
				disabled={action.disabled}
				key={action.id}
				onClick={action.onClick}
				title={action.title}
				type="button"
			>
				{action.label}
			</button>
		);
	});
	return (
		<div
			className={cn(
				"relative flex gap-2 border border-border bg-popover/95 text-popover-foreground shadow-lg/10 backdrop-blur-sm",
				compact
					? "items-center rounded-xl py-2 pr-1.5 pl-3 text-xs"
					: "items-start rounded-2xl py-3 pr-10 pl-3.5 text-left text-sm",
				className,
			)}
			data-testid={testId}
		>
			<Icon
				aria-hidden
				className={cn(
					"shrink-0 text-popover-foreground/90",
					compact ? "size-3.5" : "mt-0.5 size-4",
					state === "updating" && "animate-spin",
				)}
			/>
			<div className="min-w-0 flex-1 leading-snug">
				<div className={cn(compact && "truncate font-medium")}>{title}</div>
				{description && (
					<div
						className={cn(
							"text-popover-foreground/70 tabular-nums",
							compact ? "truncate" : "mt-0.5",
						)}
					>
						{description}
					</div>
				)}
				{detail && (
					<div className="mt-2 break-all font-mono text-[11px] text-muted-foreground leading-4">
						{detail}
					</div>
				)}
				{!compact && buttons.length > 0 && (
					<div className="-ms-2 mt-3 flex flex-wrap gap-1">{buttons}</div>
				)}
			</div>
			{compact && buttons}
			{onDismiss && (
				<button
					aria-label={t({ message: "Dismiss" })}
					className={cn(
						"flex shrink-0 items-center justify-center rounded-full text-popover-foreground/65 transition-colors hover:bg-popover-foreground/10 hover:text-popover-foreground",
						compact ? "size-5" : "absolute top-2 right-2 size-6",
					)}
					onClick={onDismiss}
					title={t({ message: "Dismiss" })}
					type="button"
				>
					<X className={compact ? "size-3" : "size-3.5"} />
				</button>
			)}
		</div>
	);
}
