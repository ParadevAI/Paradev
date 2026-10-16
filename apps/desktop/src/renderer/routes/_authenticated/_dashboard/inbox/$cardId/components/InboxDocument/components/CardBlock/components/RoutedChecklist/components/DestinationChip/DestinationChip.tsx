import {
	type Brand,
	BrandMark,
} from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import type { RoutedDestinationView } from "../../../../types";
import { useDestinationText } from "../../hooks/useDestinationText";
import type { RoutedPayload } from "../../utils/routedValue";

export const DESTINATION_BRAND: Record<RoutedDestinationView["kind"], Brand> = {
	gmail: "gmail",
	linear: "linear",
	slack: "slack",
};

interface DestinationChipProps {
	destination: RoutedDestinationView;
	payload: RoutedPayload | null;
}

/** Where a row goes, in a few words beside the product's mark. */
export function DestinationChip({
	destination,
	payload,
}: DestinationChipProps) {
	const text = useDestinationText();
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			<BrandMark
				brand={DESTINATION_BRAND[destination.kind]}
				className="size-3.5"
			/>
			<span className="truncate">{text.chip(destination, payload)}</span>
		</span>
	);
}
