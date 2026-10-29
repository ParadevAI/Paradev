import { Plural, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ComponentProps } from "react";
import { ActorName } from "../ActorName";

type OthersLabelProps = Omit<ComponentProps<typeof ActorName>, "actorId"> & {
	actorIds: string[];
};

/** One other person by name; more as "N others" with their names on hover. */
export function OthersLabel({ actorIds, ...names }: OthersLabelProps) {
	const { t } = useLingui();
	const [only] = actorIds;
	if (actorIds.length === 1 && only) {
		return <ActorName actorId={only} {...names} />;
	}
	const list = actorIds
		.map(
			(id) =>
				names.peopleById.get(id)?.name ??
				names.devNames.get(id) ??
				t({ message: "Unknown" }),
		)
		.join(", ");
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span className="cursor-default hover:underline">
					<Plural value={actorIds.length} one="# other" other="# others" />
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs">{list}</TooltipContent>
		</Tooltip>
	);
}
