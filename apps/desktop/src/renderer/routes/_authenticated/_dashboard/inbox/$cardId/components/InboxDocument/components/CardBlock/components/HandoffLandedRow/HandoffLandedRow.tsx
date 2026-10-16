import { LuExternalLink } from "react-icons/lu";
import {
	type Brand,
	BrandMark,
} from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import type { HandoffLandedView } from "../../types";

interface HandoffLandedRowProps {
	landed: HandoffLandedView;
	/** Where the write landed. */
	brand: Brand;
}

/** One write a handoff already made, in the server's words, with the way to it. */
export function HandoffLandedRow({ landed, brand }: HandoffLandedRowProps) {
	return (
		<div data-landed className="flex min-w-0 items-center gap-2 text-[13px]">
			<BrandMark brand={brand} />
			{landed.url ? (
				<a
					href={landed.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex min-w-0 items-center gap-1 text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
				>
					<span className="truncate">{landed.text}</span>
					<LuExternalLink className="size-3 shrink-0 opacity-60" />
				</a>
			) : (
				<span className="min-w-0 truncate text-foreground">{landed.text}</span>
			)}
		</div>
	);
}
