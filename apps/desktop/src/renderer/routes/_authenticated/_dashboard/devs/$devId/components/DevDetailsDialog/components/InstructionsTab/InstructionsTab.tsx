import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { useUpdateDev } from "../../hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];
const LIMIT = 8000;

export function InstructionsTab({ dev }: { dev: Dev }) {
	const update = useUpdateDev();
	const [text, setText] = useState(dev.instructions ?? "");
	const changed = text !== (dev.instructions ?? "");
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				value={text}
				maxLength={LIMIT}
				onChange={(event) => setText(event.target.value)}
				className="min-h-72 bg-background font-mono text-[12.5px] leading-relaxed"
			/>
			<div className="flex items-center justify-between text-[12px] text-muted-foreground">
				<span className="tabular-nums">
					{text.length} / {LIMIT}
				</span>
				<Button
					size="sm"
					disabled={!changed || update.isPending}
					onClick={() =>
						update.mutate({
							agentId: dev.id,
							instructions: text.trim() || null,
						})
					}
				>
					<Trans>Save</Trans>
				</Button>
			</div>
		</div>
	);
}
