"use client";

import { useLingui } from "@lingui/react/macro";
import { AutomationsDemo } from "@/app/[lang]/components/FeaturesSection/components/AutomationsDemo";
import { CliDemo } from "@/app/[lang]/components/FeaturesSection/components/CliDemo";
import { FeatureDemo } from "@/app/[lang]/components/FeaturesSection/components/FeatureDemo";
import { ParallelExecutionDemo } from "@/app/[lang]/components/FeaturesSection/components/ParallelExecutionDemo";
import { UniversalCompatibilityDemo } from "@/app/[lang]/components/FeaturesSection/components/UniversalCompatibilityDemo";
import { FEATURES } from "@/app/[lang]/components/FeaturesSection/constants";

const DEMO_COMPONENTS = [
	UniversalCompatibilityDemo,
	ParallelExecutionDemo,
	AutomationsDemo,
	CliDemo,
];

import type { FeatureOverlay } from "../../copy";

export function LandingFeatures({ overlay }: { overlay?: FeatureOverlay }) {
	const { t } = useLingui();

	return (
		<section id="features" className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				{/* Feature Rows */}
				<div className="space-y-24 sm:space-y-32">
					{FEATURES.map((feature, index) => {
						const modified = overlay && feature.id === overlay.id;
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
									<h3 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
										{modified ? overlay.title : t(feature.title)}
									</h3>
									<p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-[500px]">
										{modified ? overlay.description : t(feature.description)}
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
