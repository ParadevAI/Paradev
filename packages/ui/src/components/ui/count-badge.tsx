import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const countBadgeVariants = cva(
	"pointer-events-none absolute -top-0.5 -right-[3px] flex items-center justify-center whitespace-nowrap rounded-full bg-muted-foreground px-0.5 font-bold text-background tabular-nums tracking-[-0.02em]",
	{
		variants: {
			size: {
				default:
					"h-[11px] min-w-[11px] text-[7.5px] leading-[11px] ring-[1.5px]",
				sm: "h-2.5 min-w-2.5 text-[6.5px] leading-2.5 ring-1",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

/**
 * A short count or label pinned to the top-right corner of an icon. The
 * parent must be `relative`; the caller sets the ring color to the surface
 * the icon sits on.
 */
function CountBadge({
	className,
	size,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof countBadgeVariants>) {
	return (
		<span
			data-slot="count-badge"
			className={cn(countBadgeVariants({ size }), className)}
			{...props}
		/>
	);
}

export { CountBadge, countBadgeVariants };
