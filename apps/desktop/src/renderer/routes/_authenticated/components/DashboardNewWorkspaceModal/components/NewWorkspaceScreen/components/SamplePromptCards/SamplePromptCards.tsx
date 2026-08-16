import { useQuery } from "@tanstack/react-query";
import {
	BookOpenIcon,
	BugIcon,
	FlaskConicalIcon,
	ListChecksIcon,
	ScrollTextIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { track } from "renderer/lib/analytics";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { shuffledSamplePrompts } from "../SamplePrompts/constants";
import { AgentLogoCluster } from "./components/AgentLogoCluster";

const CARD_ICONS: Record<string, typeof WrenchIcon> = {
	"set-up-project": WrenchIcon,
	"explain-repo": BookOpenIcon,
	"fix-small-bug": BugIcon,
	"improve-agent-docs": ScrollTextIcon,
	"add-missing-tests": FlaskConicalIcon,
	"clean-up-todos": ListChecksIcon,
};

const CARD_COUNT = 4;

interface SamplePromptCardsProps {
	hostUrl: string | null;
	projectId: string | null;
	onSelect: (prompt: string) => void;
}

export function SamplePromptCards({
	hostUrl,
	projectId,
	onSelect,
}: SamplePromptCardsProps) {
	// Shuffled once per mount so every prompt in the pool gets exposure;
	// re-shuffling per render would reorder cards under the pointer.
	const [shuffledPrompts] = useState(shuffledSamplePrompts);

	// Setup takes 75% of all prompt clicks, so it leads — but pitching setup for
	// a project that already has setup/teardown/run commands reads as noise.
	// Same query the v2 sidebar setup card uses.
	const canCheckSetup = Boolean(hostUrl && projectId);
	const { data: needsSetupScripts, isPending } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () =>
			hostUrl && projectId
				? getHostServiceClientByUrl(hostUrl).config.shouldShowSetupCard.query({
						projectId,
					})
				: false,
		enabled: canCheckSetup,
	});

	// Deciding mid-flight would swap a card out from under the pointer.
	if (canCheckSetup && isPending) return null;

	const setupCard = shuffledPrompts.find(
		(sample) => sample.id === "set-up-project",
	);
	const cards = [
		...(needsSetupScripts === true && setupCard ? [setupCard] : []),
		...shuffledPrompts.filter((sample) => sample.id !== "set-up-project"),
	].slice(0, CARD_COUNT);

	return (
		<div className="px-1 pb-2">
			<div className="grid grid-cols-2 gap-1.5 rounded-2xl border-[0.5px] border-border/60 bg-foreground/[0.03] p-1.5">
				{cards.map((sample) => {
					const Icon = CARD_ICONS[sample.id] ?? WrenchIcon;
					return (
						<button
							key={sample.id}
							type="button"
							className="flex cursor-pointer flex-col items-start gap-1.5 rounded-[11px] bg-background/70 p-3 text-left transition-colors hover:bg-foreground/[0.06]"
							onClick={() => {
								track("new_workspace_sample_prompt_clicked", {
									prompt_id: sample.id,
									layout: "cards",
								});
								onSelect(sample.prompt);
							}}
						>
							{sample.id === "improve-agent-docs" ? (
								<AgentLogoCluster />
							) : (
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<span className="text-sm font-medium text-foreground/90">
								{sample.label}
							</span>
							<span className="text-xs text-muted-foreground">
								{sample.description}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
