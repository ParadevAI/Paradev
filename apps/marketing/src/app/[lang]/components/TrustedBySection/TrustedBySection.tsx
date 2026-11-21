"use client";

import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import { CLIENT_LOGOS } from "@/lib/client-logos";

export function TrustedBySection() {
	const midpoint = Math.ceil(CLIENT_LOGOS.length / 2);
	const logoRows = [
		CLIENT_LOGOS.slice(0, midpoint),
		CLIENT_LOGOS.slice(midpoint),
	];

	return (
		<section className="py-16 sm:py-20 bg-background overflow-hidden">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				<div>
					<h2 className="text-base sm:text-xl font-medium text-center mb-4 sm:mb-8 text-foreground">
						<Trans>Trusted by builders from</Trans>
					</h2>
				</div>

				{/* Mobile/tablet: responsive grid to avoid horizontal overflow */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 md:hidden">
					{CLIENT_LOGOS.map((client) => (
						<div
							key={client.name}
							className="flex items-center justify-center min-w-0 whitespace-nowrap h-16 sm:h-18 rounded-[2px] border border-foreground/[0.1] bg-foreground/[0.03] opacity-90 transition-all duration-200 hover:opacity-100 hover:border-foreground/[0.2] hover:bg-foreground/[0.06]"
						>
							<Image
								src={client.logo}
								alt={client.label}
								width={200}
								height={client.height}
								className={`object-contain scale-75 sm:scale-90 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
								style={{
									height: client.height,
									width: "auto",
									borderRadius: client.borderRadius ?? 0,
									marginTop: client.marginTop ?? 0,
								}}
								unoptimized
							/>
						</div>
					))}
				</div>

				{/* Desktop: two explicit rows */}
				<div className="hidden md:block space-y-3 sm:space-y-4">
					{logoRows.map((row) => (
						<div
							key={row.map((client) => client.name).join("-")}
							className="flex items-center justify-center gap-3.5"
						>
							{row.map((client) => (
								<div
									key={client.name}
									className="flex items-center justify-center whitespace-nowrap h-24 w-[168px] rounded-[2px] border border-foreground/[0.1] bg-foreground/[0.03] opacity-90 transition-all duration-200 hover:opacity-100 hover:border-foreground/[0.2] hover:bg-foreground/[0.06]"
								>
									<Image
										src={client.logo}
										alt={client.label}
										width={200}
										height={client.height}
										className={`object-contain scale-100 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
										style={{
											height: client.height,
											width: "auto",
											borderRadius: client.borderRadius ?? 0,
											marginTop: client.marginTop ?? 0,
										}}
										unoptimized
									/>
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
