import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { useUpdateDev } from "../../hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];

export function DevDescription({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const update = useUpdateDev();
	const [draft, setDraft] = useState<string | null>(null);
	if (draft !== null) {
		return (
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					update.mutate({ agentId: dev.id, description: draft.trim() || null });
					setDraft(null);
				}}
			>
				<Textarea
					autoFocus
					value={draft}
					maxLength={500}
					placeholder={t({ message: "What it does" })}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setDraft(null);
					}}
					className="min-h-20 text-[13px]"
				/>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setDraft(null)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" size="sm">
						<Trans>Save</Trans>
					</Button>
				</div>
			</form>
		);
	}
	if (!dev.canManage) {
		return dev.description ? (
			<p className="text-[13px] whitespace-pre-wrap text-foreground/80">
				{dev.description}
			</p>
		) : null;
	}
	return (
		<button
			type="button"
			onClick={() => setDraft(dev.description ?? "")}
			className="-mx-2 rounded-md px-2 py-1 text-left text-[13px] whitespace-pre-wrap text-foreground/80 hover:bg-fill-hover"
		>
			{dev.description || (
				<span className="text-muted-foreground">
					<Trans>Add what it does</Trans>
				</span>
			)}
		</button>
	);
}
