"use client";

import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { track } from "@/lib/analytics";

const SIZES = {
	xs: "gap-2 px-2.5 py-1 text-xs sm:text-sm",
	lg: "gap-4 px-5 py-3 text-2xl sm:text-3xl",
};

export function PromoCode({
	code,
	source,
	size = "lg",
	className,
}: {
	code: string;
	source: string;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	const copyCode = async () => {
		await navigator.clipboard.writeText(code);
		track("promo_code_copied", { code, source });
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const iconClass = { xs: "size-3.5", lg: "size-5" }[size];

	return (
		<button
			type="button"
			onClick={copyCode}
			aria-label={copied ? "Code copied" : `Copy code ${code}`}
			className={cn(
				"group inline-flex items-center border border-dashed border-foreground/40 bg-background/80 font-mono tracking-wider text-foreground transition-colors hover:border-foreground",
				SIZES[size],
				className,
			)}
		>
			{code}
			{copied ? (
				<Check aria-hidden className={cn(iconClass, "text-muted-foreground")} />
			) : (
				<Copy
					aria-hidden
					className={cn(
						iconClass,
						"text-muted-foreground transition-colors group-hover:text-foreground",
					)}
				/>
			)}
		</button>
	);
}
