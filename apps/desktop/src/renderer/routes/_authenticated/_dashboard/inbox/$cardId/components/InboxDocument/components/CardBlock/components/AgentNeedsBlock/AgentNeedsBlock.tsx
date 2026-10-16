import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import {
	BRAND_NAMES,
	type Brand,
	BrandMark,
} from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import type { CardBlockViewProps } from "../../types";
import { CardActions } from "../CardActions";
import { SupersetWorkspace } from "../SupersetWorkspace";

interface AgentNeedsBlockProps
	extends CardBlockViewProps<"superset.agent_needs"> {
	/** The ask question this card answers, drawn inside it. */
	ask: ReactNode;
	onConnect: (href: string) => void;
}

function isBrand(id: string): id is Brand {
	return id in BRAND_NAMES;
}

/** An agent is blocked on the reader: where it is working, and the account, tool or question it needs answered. */
export function AgentNeedsBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
	ask,
	onConnect,
}: AgentNeedsBlockProps) {
	const service = view.service;
	return (
		<div className="flex flex-col">
			{view.workspace && <SupersetWorkspace workspace={view.workspace} />}
			<div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-[13px] first:border-t-0">
				{view.need === "credential" && service && (
					<div className="flex items-center gap-2.5">
						{isBrand(service.id) && <BrandMark brand={service.id} />}
						<span className="font-medium text-foreground">{service.label}</span>
						{view.scope && (
							<code className="min-w-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
								{view.scope}
							</code>
						)}
						{!done && (
							<Button
								type="button"
								size="sm"
								variant="link"
								className="ml-auto h-auto shrink-0 p-0"
								onClick={() => onConnect("/settings/integrations")}
							>
								<Trans>Open settings</Trans>
							</Button>
						)}
					</div>
				)}
				{view.need === "tool" && view.tool && (
					<div className="flex items-center gap-2">
						<code className="min-w-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground [overflow-wrap:anywhere]">
							{view.tool}
						</code>
					</div>
				)}
				{view.need === "question" && ask}
			</div>
			{!done && view.need !== "question" && (
				<CardActions
					actions={actions}
					pending={pending}
					failure={failure}
					onAct={onAct}
				/>
			)}
		</div>
	);
}
