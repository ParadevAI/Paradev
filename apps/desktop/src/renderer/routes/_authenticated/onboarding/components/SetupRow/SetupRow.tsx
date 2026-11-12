import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";

interface SetupRowProps {
	icon: ReactNode;
	title: string;
	detail: ReactNode;
	done: boolean;
	actions?: ReactNode;
	footer?: ReactNode;
}

export function SetupRow({
	icon,
	title,
	detail,
	done,
	actions,
	footer,
}: SetupRowProps) {
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-foreground/[0.05] p-4">
			<div className="flex items-center gap-4">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-foreground [&_svg]:size-4">
					{icon}
				</span>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground text-sm">{title}</p>
					<p className="mt-0.5 select-text break-words text-muted-foreground text-xs">
						{detail}
					</p>
				</div>
				{done ? (
					<LuCheck
						className="size-4 shrink-0 text-emerald-500"
						strokeWidth={2.5}
					/>
				) : (
					actions && (
						<div className="flex shrink-0 items-center gap-2">{actions}</div>
					)
				)}
			</div>
			{footer}
		</div>
	);
}
