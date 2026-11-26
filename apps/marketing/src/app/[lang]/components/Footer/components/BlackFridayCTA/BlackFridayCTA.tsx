"use client";

import { COMPANY } from "@superset/shared/constants";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { TrackedLink } from "@/app/[lang]/components/TrackedLink";
import { checkoutHref } from "@/app/[lang]/pricing/utils/checkoutHref";
import { env } from "@/env";
import { track } from "@/lib/analytics";

const PROMO_CODE = "BFCM2026";

export function BlackFridayCTA() {
	const [copied, setCopied] = useState(false);

	const copyCode = async () => {
		await navigator.clipboard.writeText(PROMO_CODE);
		track("promo_code_copied", { code: PROMO_CODE, source: "black_friday" });
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section
			id="black-friday"
			className="w-full py-14 [@media(max-height:800px)]:py-8"
		>
			<div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col items-center text-center">
				<p className="mb-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
					Black Friday
				</p>
				<h2 className="text-3xl sm:text-5xl lg:text-7xl lg:[@media(max-height:800px)]:text-6xl font-light tracking-tight leading-[1.1] text-foreground mb-8">
					90 days of Pro, free.
				</h2>
				<button
					type="button"
					onClick={copyCode}
					aria-label={copied ? "Code copied" : `Copy code ${PROMO_CODE}`}
					className="group mb-4 flex items-center gap-4 border border-dashed border-foreground/40 bg-background/80 px-5 py-3 font-mono text-2xl sm:text-3xl tracking-wider text-foreground transition-colors hover:border-foreground"
				>
					{PROMO_CODE}
					{copied ? (
						<Check aria-hidden className="size-5 text-muted-foreground" />
					) : (
						<Copy
							aria-hidden
							className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
						/>
					)}
				</button>
				<p className="mb-10 text-sm sm:text-base text-muted-foreground [@media(max-height:800px)]:mb-8">
					Enter the code at checkout when you pick Pro.
				</p>
				<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
					<TrackedLink
						href={checkoutHref(env.NEXT_PUBLIC_WEB_URL, "pro", false)}
						event="checkout_clicked"
						properties={{ source: "black_friday", tier: "pro" }}
						className="bg-foreground text-background px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal transition-colors hover:bg-brand hover:text-white"
					>
						Get Pro free for 90 days
					</TrackedLink>
					<button
						type="button"
						className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
						onClick={() => {
							track("github_clicked", { source: "black_friday" });
							window.open(COMPANY.GITHUB_URL, "_blank", "noopener,noreferrer");
						}}
					>
						Star on GitHub
						<FaGithub aria-hidden className="size-4" />
					</button>
				</div>
			</div>
		</section>
	);
}
