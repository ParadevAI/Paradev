import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { useUpdateDev } from "../../hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];
const LIMIT = 8000;

export function DevInstructions({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const update = useUpdateDev();
	const [draft, setDraft] = useState<string | null>(null);
	if (draft !== null) {
		return (
			<div className="flex flex-col gap-2">
				<Textarea
					autoFocus
					value={draft}
					maxLength={LIMIT}
					placeholder={t({ message: "How it should work and what to avoid" })}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setDraft(null);
					}}
					className="min-h-40 resize-y text-[13px] leading-relaxed"
				/>
				<div className="flex justify-end gap-2">
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						size="sm"
						disabled={update.isPending}
						onClick={() =>
							update.mutate(
								{ agentId: dev.id, instructions: draft.trim() || null },
								{ onSuccess: () => setDraft(null) },
							)
						}
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
			onClick={() => setDraft(dev.instructions ?? "")}
			className="line-clamp-4 rounded-md px-2 py-2 text-left text-[13px] whitespace-pre-wrap text-foreground/80 hover:bg-fill-hover"
		>
			{dev.instructions || (
				<span className="text-muted-foreground">
					<Trans>Add instructions</Trans>
				</span>
			)}
		</button>
	);
}
