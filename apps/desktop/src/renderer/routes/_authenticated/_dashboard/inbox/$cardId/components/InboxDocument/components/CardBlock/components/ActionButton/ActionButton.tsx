import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { useActionKey } from "../../providers/ActionKeysProvider";
import { useConfirmEcho } from "../../providers/ConfirmEchoProvider";
import type { CardAction } from "../../types";
import type { ActionKeySlot } from "../../utils/assignActionKeys";
import { ActionKeycap } from "../ActionKeycap";

interface ActionButtonProps
	extends Omit<ComponentProps<typeof Button>, "onClick"> {
	/** The card action this button takes; absent draws nothing. */
	action: CardAction | undefined;
	pending: boolean;
	/** The confirmation's way out, when "Cancel" would read as the action itself. */
	dismissLabel?: ReactNode;
	/** The exact write in words, when the reader chose its amount or target; asks first even when the action has no sentence of its own. */
	confirmText?: ReactNode;
	/** The key this button answers to while its block has focus, when one action is drawn as several buttons. */
	keySlot?: ActionKeySlot;
	onClick: () => void;
}

/** A button for one card action: off while another runs, off with the reason on hover when the reader may not take it, and asking first when the action wants a confirmation. */
export function ActionButton({
	action,
	pending,
	disabled,
	dismissLabel,
	confirmText,
	keySlot,
	onClick,
	children,
	...props
}: ActionButtonProps) {
	const [confirming, setConfirming] = useState(false);
	const [asked, setAsked] = useState<string | undefined>();
	const echo = useConfirmEcho();
	const own = useActionKey(action?.id);
	const slot = own && keySlot ? keySlot : own;
	const confirmButton = useRef<HTMLButtonElement>(null);
	if (!action) return null;
	const question = confirmText ?? (confirming ? asked : action.confirm);
	const button = (
		<Button
			type="button"
			size="sm"
			{...props}
			data-action-key={slot}
			disabled={pending || disabled || Boolean(action.disabled)}
			onClick={() => {
				if (question) {
					setAsked(action.confirm);
					echo(
						action.id,
						action.confirm ??
							(typeof confirmText === "string" ? confirmText : undefined),
					);
					setConfirming(true);
				} else onClick();
			}}
		>
			{children}
			<ActionKeycap slot={slot} />
		</Button>
	);
	if (action.disabled) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">{button}</span>
				</TooltipTrigger>
				<TooltipContent side="top">{action.disabled}</TooltipContent>
			</Tooltip>
		);
	}
	if (!question) return button;
	return (
		<>
			{button}
			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						confirmButton.current?.focus();
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>{children}</AlertDialogTitle>
						<AlertDialogDescription>{question}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{dismissLabel ?? <Trans>Cancel</Trans>}
						</AlertDialogCancel>
						<AlertDialogAction
							ref={confirmButton}
							variant={
								props.variant === "destructive" ? "destructive" : undefined
							}
							onClick={onClick}
						>
							{children}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
