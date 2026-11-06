import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";

interface ConnectionRowProps {
	title: ReactNode;
	detail: ReactNode;
	connected: boolean;
	action: ReactNode;
}

export function ConnectionRow({
	title,
	detail,
	connected,
	action,
}: ConnectionRowProps) {
	return (
		<div className="flex items-center gap-4 px-4 py-4">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
				<FaGithub className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{title}</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{detail}
				</div>
			</div>
			{connected ? (
				<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
					<span className="size-2 rounded-full bg-green-500" />
					<Trans>Connected</Trans>
				</span>
			) : (
				action
			)}
		</div>
	);
}
