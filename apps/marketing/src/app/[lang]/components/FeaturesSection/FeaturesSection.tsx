"use client";

import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { AutomationsDemo } from "./components/AutomationsDemo";
import { CliDemo } from "./components/CliDemo";
import { FeatureDemo } from "./components/FeatureDemo";
import { ParallelExecutionDemo } from "./components/ParallelExecutionDemo";
import { UniversalCompatibilityDemo } from "./components/UniversalCompatibilityDemo";
import { FEATURES } from "./constants";

const DEMO_COMPONENTS = [
	UniversalCompatibilityDemo,
	ParallelExecutionDemo,
	AutomationsDemo,
	CliDemo,
];

export function FeaturesSection() {
	const { t, i18n } = useLingui();

	return (
		<section id="features" className="relative py-16 sm:py-24">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				{/* Feature Rows */}
				<div className="space-y-16 sm:space-y-20">
					{FEATURES.map((feature, index) => {
						const isReversed = index % 2 === 1;
						const DemoComponent = DEMO_COMPONENTS[index];
						return (
							<div
								key={feature.id}
								className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center"
							>
								{/* Text Content */}
								<div
									className={`space-y-6 ${isReversed ? "lg:order-2" : "lg:order-1"}`}
								>
									<h3 className="text-2xl sm:text-3xl font-light tracking-tight text-foreground">
										{feature.href ? (
											<Link
												href={
													i18n.locale === "en"
														? feature.href
														: `/${i18n.locale}${feature.href}`
												}
												className="group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground/40"
											>
												{t(feature.title)}
												<LuArrowRight
													aria-hidden="true"
													className="ml-2 inline size-[0.75em] -translate-x-1 align-baseline text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:opacity-60"
												/>
											</Link>
										) : (
											t(feature.title)
										)}
									</h3>
									<p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-[500px]">
										{t(feature.description)}
									</p>
								</div>

								{/* Demo */}
								<div className={`${isReversed ? "lg:order-1" : "lg:order-2"}`}>
									<FeatureDemo fitContent={feature.id === "agent-independence"}>
										{DemoComponent && <DemoComponent />}
									</FeatureDemo>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
