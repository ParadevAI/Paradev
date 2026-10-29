import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";

interface ChoosePrimaryStepProps {
	repositories: ReadonlyArray<{ id: string; fullName: string }>;
	isStarting: boolean;
	onBack: () => void;
	onGetStarted: (primaryId: string) => void;
}

export function ChoosePrimaryStep({
	repositories,
	isStarting,
	onBack,
	onGetStarted,
}: ChoosePrimaryStepProps) {
	const [primaryId, setPrimaryId] = useState(repositories[0]?.id ?? "");

	return (
		<>
			<DialogHeader className="px-5 pt-5 pb-4 text-left">
				<DialogTitle className="text-base leading-tight">
					<Trans>Choose the primary repository</Trans>
				</DialogTitle>
				<DialogDescription className="text-sm leading-snug">
					<Trans>
						Cloud workspaces open on it, and its .superset/config.json runs
						setup. The others are checked out beside it.
					</Trans>
				</DialogDescription>
			</DialogHeader>
			<div className="px-5 pb-5">
				<RadioGroup
					className="gap-0 divide-y divide-border overflow-hidden rounded-md border border-border"
					onValueChange={setPrimaryId}
					value={primaryId}
				>
					{repositories.map((repository) => (
						<Label
							className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm font-normal hover:bg-accent/40"
							htmlFor={`primary-${repository.id}`}
							key={repository.id}
						>
							<RadioGroupItem
								id={`primary-${repository.id}`}
								value={repository.id}
							/>
							<FaGithub className="size-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate">
								{repository.fullName}
							</span>
						</Label>
					))}
				</RadioGroup>
			</div>
			<DialogFooter className="items-center border-t border-border/70 bg-muted/20 px-5 py-3">
				<span className="flex-1" />
				<Button onClick={onBack} size="sm" variant="ghost">
					<Trans>Back</Trans>
				</Button>
				<Button
					disabled={!primaryId || isStarting}
					onClick={() => onGetStarted(primaryId)}
					size="sm"
				>
					{isStarting ? <Trans>Starting…</Trans> : <Trans>Get started</Trans>}
				</Button>
			</DialogFooter>
		</>
	);
}
