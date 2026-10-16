import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { useActionKeys } from "../../providers/ActionKeysProvider";
import { useConfirmEcho } from "../../providers/ConfirmEchoProvider";
import type { CardAction as Action } from "../../types";
import { ActionKeycap } from "../ActionKeycap";

interface CardActionsProps {
	actions: Action[];
	pending: boolean;
	failure: string | null;
	onAct: (actionId: string, input?: string) => void;
	/** Links shown before the actions, such as Open workspace. */
	leading?: React.ReactNode;
	/** Ids of the actions that cannot go out with an empty box. */
	inputRequired?: readonly string[];
}

/** A card's actions in a row; one that takes words or a confirmation opens a box under the row instead of a dialog. */
export function CardActions({
	actions,
	pending,
	failure,
	onAct,
	leading,
	inputRequired = [],
}: CardActionsProps) {
	const [writing, setWriting] = useState<Action | null>(null);
	const [text, setText] = useState("");
	const box = useRef<HTMLTextAreaElement>(null);
	const confirmButton = useRef<HTMLButtonElement>(null);
	const echo = useConfirmEcho();
	const slots = useActionKeys();
	const keyed = Object.keys(slots).length > 0;
	useEffect(() => {
		if (!writing) return;
		if (writing.input) box.current?.focus();
		else confirmButton.current?.focus();
	}, [writing]);
	const inputMissing =
		writing !== null &&
		inputRequired.includes(writing.id) &&
		text.trim() === "";
	const submit = () => {
		if (!writing || pending || inputMissing) return;
		onAct(writing.id, writing.input ? text.trim() || undefined : undefined);
	};

	return (
		<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
			{failure && <p className="text-xs text-destructive">{failure}</p>}
			{writing && (
				<div className="flex flex-col gap-2">
					{writing.confirm && (
						<p className="text-xs text-muted-foreground">{writing.confirm}</p>
					)}
					{writing.input && (
						<Textarea
							ref={box}
							value={text}
							onChange={(event) => setText(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
									event.preventDefault();
									submit();
								}
								if (event.key === "Escape") setWriting(null);
							}}
							placeholder={writing.input}
							aria-label={writing.input}
							className="min-h-20 text-[13px]"
						/>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setWriting(null)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							ref={confirmButton}
							type="button"
							size="sm"
							variant={writing.style === "danger" ? "destructive" : "default"}
							className="min-w-0 shrink"
							data-action-key={keyed ? "primary" : undefined}
							disabled={pending || inputMissing}
							onClick={submit}
						>
							<span className="truncate">{writing.label}</span>
							<ActionKeycap slot={keyed ? "primary" : undefined} />
						</Button>
					</div>
				</div>
			)}
			{!writing && (
				<div className="flex flex-wrap items-center gap-2">
					<div className="mr-auto flex items-center gap-2">{leading}</div>
					{actions.map((action) => {
						const button = (
							<Button
								key={action.id}
								type="button"
								size="sm"
								variant={
									action.style === "primary"
										? "default"
										: action.style === "danger"
											? "destructive"
											: "outline"
								}
								className="max-w-full"
								data-action-key={slots[action.id]}
								disabled={pending || Boolean(action.disabled)}
								onClick={() => {
									if (action.input || action.confirm) {
										setText("");
										echo(action.id, action.confirm);
										setWriting(action);
									} else onAct(action.id);
								}}
							>
								<span className="truncate">{action.label}</span>
								<ActionKeycap slot={slots[action.id]} />
							</Button>
						);
						return action.disabled ? (
							<Tooltip key={action.id}>
								<TooltipTrigger asChild>
									<span className="inline-flex max-w-full">{button}</span>
								</TooltipTrigger>
								<TooltipContent side="top">{action.disabled}</TooltipContent>
							</Tooltip>
						) : (
							button
						);
					})}
				</div>
			)}
		</div>
	);
}
