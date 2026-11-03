import { Trans } from "@lingui/react/macro";
import { Bot } from "lucide-react";

export function AskerLabel({ name }: { name: string }) {
	return (
		<span className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
			<Bot className="size-3.5 shrink-0 text-muted-foreground" />
			<Trans>{name} asks</Trans>
		</span>
	);
}
