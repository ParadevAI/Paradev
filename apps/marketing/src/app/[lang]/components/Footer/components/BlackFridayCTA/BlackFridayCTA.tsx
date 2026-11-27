"use client";

import { BlackFridayActions } from "@/app/[lang]/components/BlackFridayActions";
import { PromoCode } from "@/app/[lang]/components/PromoCode";

const PROMO_CODE = "BFCM2026";

export function BlackFridayCTA() {
	return (
		<section
			id="black-friday"
			className="w-full scroll-mt-16 pt-14 pb-32 sm:pb-48 [@media(max-height:800px)]:pt-8 [@media(max-height:800px)]:pb-24"
		>
			<div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col items-center text-center">
				<p className="mb-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
					Black Friday
				</p>
				<h2 className="text-3xl sm:text-5xl lg:text-7xl lg:[@media(max-height:800px)]:text-6xl font-light tracking-tight leading-[1.1] text-foreground mb-8">
					90 days of Pro, free.
				</h2>
				<PromoCode code={PROMO_CODE} source="black_friday" className="mb-4" />
				<p className="mb-10 text-sm sm:text-base text-muted-foreground [@media(max-height:800px)]:mb-8">
					Enter the code at checkout when you pick Pro.
				</p>
				<BlackFridayActions source="black_friday" />
			</div>
		</section>
	);
}
