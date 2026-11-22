import type { ReactNode } from "react";
import { useConnector } from "../../hooks/useConnector";

interface ConnectorRowProps {
	slug: string;
	description?: string | null;
	icon?: ReactNode;
}

export function ConnectorRow({ slug, description, icon }: ConnectorRowProps) {
	const { connector, isPending } = useConnector(slug);

	if (isPending || !connector) return null;

	return (
		<div className="flex items-center gap-3 py-3.5">
			{icon}
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-foreground">
					{connector.displayName}
				</div>
				<p className="truncate text-xs text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}
