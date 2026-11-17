import { useLingui } from "@lingui/react/macro";
import type { TaskStatus } from "@superset/chats-core";
import { cn } from "@superset/ui/utils";

const COLOR: Record<TaskStatus, string> = {
	todo: "text-muted-foreground",
	in_progress: "text-amber-500",
	done: "text-emerald-500",
};

interface TaskStatusRingProps {
	status: TaskStatus;
	size?: number;
	/** Ticks the task (done or back to to do); without it the ring is only a picture. */
	onToggle?: () => void;
	title?: string;
	className?: string;
}

/** A task's status as a ring: empty to do, half filled in progress, a check when done. */
export function TaskStatusRing({
	status,
	size = 18,
	onToggle,
	title = "",
	className,
}: TaskStatusRingProps) {
	const { t } = useLingui();
	const ring = (
		<svg
			width={size}
			height={size}
			viewBox="0 0 20 20"
			fill="none"
			aria-hidden="true"
			className={COLOR[status]}
		>
			{status === "done" ? (
				<>
					<circle cx="10" cy="10" r="8" fill="currentColor" />
					<path
						d="M6.6 10.3l2.3 2.3 4.6-4.9"
						className="stroke-background"
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
			) : (
				<>
					<circle
						cx="10"
						cy="10"
						r="7.25"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
					{status === "in_progress" && (
						<path d="M10 4.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
					)}
				</>
			)}
		</svg>
	);
	if (!onToggle) {
		return <span className={cn("flex shrink-0", className)}>{ring}</span>;
	}
	const done = status === "done";
	return (
		<button
			type="button"
			aria-label={
				done
					? t({ message: `Reopen ${title}` })
					: t({ message: `Complete ${title}` })
			}
			aria-pressed={done}
			className={cn(
				"flex shrink-0 rounded-full transition-transform hover:scale-110",
				className,
			)}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			{ring}
		</button>
	);
}
