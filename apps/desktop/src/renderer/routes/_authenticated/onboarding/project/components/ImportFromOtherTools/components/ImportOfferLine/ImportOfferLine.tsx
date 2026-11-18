import { useLingui } from "@lingui/react/macro";
import type { ExternalWorktreeOffer } from "../../hooks/useExternalWorktrees";
import { ToolIconStack } from "../ToolIconStack";

interface ImportOfferLineProps {
	offer: ExternalWorktreeOffer;
	disabled: boolean;
	onOpen: () => void;
}

export function ImportOfferLine({
	offer,
	disabled,
	onOpen,
}: ImportOfferLineProps) {
	const { t } = useLingui();
	return (
		<div className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
			<ToolIconStack sources={offer.sources} size="sm" />
			<button
				type="button"
				onClick={onOpen}
				disabled={disabled}
				className="truncate rounded-sm text-foreground underline decoration-foreground/30 underline-offset-4 outline-none transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
			>
				{t({ message: `Import from ${offer.toolNames}` })}
			</button>
		</div>
	);
}
