import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

const LIMIT = 8000;

interface CoordinatorInstructionsProps {
	value: string;
	onSave: (instructions: string) => void;
}

/** What the person tells the coordinator before its first message; edited in place. */
export function CoordinatorInstructions({
	value,
	onSave,
}: CoordinatorInstructionsProps) {
	const { t } = useLingui();
	const [draft, setDraft] = useState<string | null>(null);
	if (draft !== null) {
		return (
			<div className="flex flex-col gap-2">
				<Textarea
					value={draft}
					maxLength={LIMIT}
					placeholder={t({
						message:
							"How to split the work, what to check before a PR, what to leave alone",
					})}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setDraft(null);
					}}
					className="min-h-32 resize-y text-[13px] leading-relaxed"
				/>
				<div className="flex justify-end gap-2">
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						size="sm"
						onClick={() => {
							onSave(draft.trim());
							setDraft(null);
						}}
					>
						<Trans>Save</Trans>
					</Button>
				</div>
			</div>
		);
	}
	return (
		<button
			type="button"
			onClick={() => setDraft(value)}
			className="line-clamp-5 w-full rounded-md px-2 py-2 text-left text-[13px] whitespace-pre-wrap text-foreground/80 hover:bg-fill-hover"
		>
			{value || (
				<span className="text-muted-foreground">
					<Trans>Add instructions</Trans>
				</span>
			)}
		</button>
	);
}
