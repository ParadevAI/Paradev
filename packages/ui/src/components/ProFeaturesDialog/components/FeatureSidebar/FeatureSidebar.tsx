import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { cn } from "../../../../lib/utils";
import { DialogTitle } from "../../../ui/dialog";
import type { ProFeature } from "../../constants";
import { PRO_FEATURES } from "../../constants";

interface FeatureSidebarProps {
	selectedFeatureId: string;
	highlightedFeatureId?: string;
	onSelectFeature: (featureId: string) => void;
}

export function FeatureSidebar({
	selectedFeatureId,
	highlightedFeatureId,
	onSelectFeature,
}: FeatureSidebarProps) {
	const orderedFeatures = useMemo(() => {
		if (!highlightedFeatureId) return PRO_FEATURES;

		const highlighted = PRO_FEATURES.find((f) => f.id === highlightedFeatureId);
		if (!highlighted) return PRO_FEATURES;

		return [
			highlighted,
			...PRO_FEATURES.filter((f) => f.id !== highlightedFeatureId),
		];
	}, [highlightedFeatureId]);

	return (
		<div className="flex w-full shrink-0 flex-col border-b bg-card md:w-[249px] md:border-r md:border-b-0">
			<div className="px-5 pt-5 md:pb-2.5">
				<DialogTitle asChild>
					<h1 className="mb-0 text-lg font-bold text-foreground">
						<Trans>Pro Features</Trans>
					</h1>
				</DialogTitle>
			</div>

			<div className="flex gap-1 overflow-x-auto px-3 py-2.5 md:flex-col md:gap-2 md:overflow-visible md:px-0">
				{orderedFeatures.map((proFeature) => (
					<FeatureButton
						key={proFeature.id}
						feature={proFeature}
						isSelected={selectedFeatureId === proFeature.id}
						onSelect={() => onSelectFeature(proFeature.id)}
					/>
				))}
			</div>
		</div>
	);
}

interface FeatureButtonProps {
	feature: ProFeature;
	isSelected: boolean;
	onSelect: () => void;
}

function FeatureButton({ feature, isSelected, onSelect }: FeatureButtonProps) {
	const { i18n } = useLingui();
	const Icon = feature.icon;

	return (
		<button
			type="button"
			onClick={(event) => {
				event.currentTarget.scrollIntoView({
					block: "nearest",
					inline: "nearest",
				});
				onSelect();
			}}
			className={cn(
				"group flex h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 transition-all duration-200 ease-out md:h-14 md:w-full md:gap-3 md:px-5",
				"cursor-pointer text-left",
				isSelected
					? "bg-muted text-foreground"
					: "text-foreground/70 hover:text-foreground hover:bg-foreground/5",
			)}
		>
			<Icon
				className={cn(
					"shrink-0 text-xl transition-all duration-200 ease-out",
					isSelected
						? feature.iconColor
						: "text-foreground/40 group-hover:text-foreground/60",
				)}
			/>
			<span className="flex flex-col">
				<span
					className={cn(
						"text-sm font-semibold transition-all duration-200",
						isSelected ? "text-foreground" : "",
					)}
				>
					{i18n._(feature.title)}
				</span>
				{feature.comingSoon && (
					<span className="text-[11px] text-muted-foreground font-normal">
						<Trans>(Coming Soon)</Trans>
					</span>
				)}
			</span>
		</button>
	);
}
