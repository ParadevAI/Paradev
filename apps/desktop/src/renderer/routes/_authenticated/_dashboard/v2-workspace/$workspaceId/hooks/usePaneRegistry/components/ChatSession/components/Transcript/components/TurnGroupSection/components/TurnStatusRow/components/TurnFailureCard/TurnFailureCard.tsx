import { Trans, useLingui } from "@lingui/react/macro";
import type { TurnError } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { ChevronRight, CircleAlert, X } from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useTurnFailureActions } from "../../../../../../../../providers/TurnFailureActionsProvider";
import { CopyErrorButton } from "./components/CopyErrorButton";
import { SignInCommand } from "./components/SignInCommand";
import {
	FAILURE_ACTIONS,
	FAILURE_TITLES,
	type FailureAction,
} from "./constants";

type Running = "continue" | "restart" | "new_chat";

type ActionButton = {
	label: ReactNode;
	onClick: () => void;
	disabled: boolean;
	expanded?: boolean;
};

const PRIMARY_CLASS =
	"border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50";

export function TurnFailureCard({
	error,
	latest,
	turnId,
}: {
	error: TurnError | undefined;
	latest: boolean;
	turnId: string;
}) {
	const { i18n, t } = useLingui();
	const actions = useTurnFailureActions();
	const kind = error?.kind ?? "unknown";
	const title = i18n._(FAILURE_TITLES[kind]);
	const text = [error?.message, error?.detail].filter(Boolean).join("\n\n");
	const [expanded, setExpanded] = useState(false);
	const [clamped, setClamped] = useState(false);
	const [signingIn, setSigningIn] = useState(false);
	const [running, setRunning] = useState<Running | null>(null);
	const [newChatFailed, setNewChatFailed] = useState(false);
	const textRef = useRef<HTMLParagraphElement>(null);
	const detailsId = useId();
	const blocked = actions?.blocked ?? true;
	const dismissed = actions?.dismissed.has(turnId) === true;

	useLayoutEffect(() => {
		const node = textRef.current;
		if (!node || expanded || dismissed) return;
		const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [expanded, dismissed]);

	useEffect(() => {
		if (!blocked) setRunning(null);
	}, [blocked]);

	if (actions && dismissed) {
		return (
			<button
				aria-expanded={false}
				className="flex w-full max-w-[36rem] items-center gap-1.5 py-0.5 text-left font-sans text-muted-foreground text-xs transition-colors hover:text-foreground"
				data-turn-failure={kind}
				onClick={() => actions.setDismissed(turnId, false)}
				type="button"
			>
				<CircleAlert className="size-3.5 shrink-0 text-destructive/70" />
				<span className="shrink-0 font-medium">{title}</span>
				{error?.message && (
					<span className="min-w-0 truncate">{error.message}</span>
				)}
			</button>
		);
	}

	const recovery = latest ? actions : null;
	const run = (next: Running, action: () => void) => {
		setRunning(next);
		action();
	};
	const restartAgent = (restart: () => Promise<boolean>) => {
		setRunning("restart");
		void restart().then((restarted) => {
			if (!restarted) setRunning(null);
		});
	};
	const startNewChat = (start: () => Promise<boolean>) => {
		setRunning("new_chat");
		setNewChatFailed(false);
		void start().then((started) => {
			if (started) return;
			setRunning(null);
			setNewChatFailed(true);
		});
	};
	const restart = kind === "auth" ? recovery?.restartAndContinue : undefined;
	const changeModel = recovery?.changeModel;
	const newChat = recovery?.startNewChat;
	const buttons: Record<FailureAction, ActionButton | null> | null = recovery
		? {
				continue: {
					label:
						running === "continue" ? (
							<Trans>Continuing…</Trans>
						) : running === "restart" ? (
							<Trans>Restarting the agent…</Trans>
						) : (
							<Trans>Continue</Trans>
						),
					disabled: blocked,
					onClick: () =>
						restart
							? restartAgent(restart)
							: run("continue", recovery.continueTask),
				},
				change_model: changeModel
					? {
							label: <Trans>Change model</Trans>,
							disabled: blocked,
							onClick: changeModel,
						}
					: null,
				sign_in: {
					label: <Trans>Sign in</Trans>,
					disabled: false,
					expanded: signingIn,
					onClick: () => setSigningIn((open) => !open),
				},
				new_chat: newChat
					? {
							label:
								running === "new_chat" ? (
									<Trans>Starting a new chat…</Trans>
								) : (
									<Trans>Start a new chat</Trans>
								),
							disabled: blocked || running === "new_chat",
							onClick: () => startNewChat(newChat),
						}
					: null,
			}
		: null;
	const offered = buttons
		? FAILURE_ACTIONS[kind].flatMap((action) => {
				const button = buttons[action];
				return button ? [{ action, ...button }] : [];
			})
		: [];

	return (
		<div
			className="relative flex w-full max-w-[36rem] gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.04] py-2.5 pr-9 pl-3 font-sans text-xs"
			data-turn-failure={kind}
			role="alert"
		>
			<CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="font-medium text-destructive text-sm leading-5">
					{title}
				</div>
				{text && (
					<p
						className={cn(
							"wrap-anywhere whitespace-pre-wrap font-mono text-[12px] text-foreground/70 leading-5",
							expanded ? "max-h-60 overflow-y-auto" : "line-clamp-3",
						)}
						id={detailsId}
						ref={textRef}
						tabIndex={expanded ? 0 : undefined}
					>
						{text}
					</p>
				)}
				{signingIn && recovery && (
					<SignInCommand command={error?.loginCommand} />
				)}
				{newChatFailed && (
					<p className="text-destructive">
						<Trans>Couldn't start a new chat.</Trans>
					</p>
				)}
				<div className="-ml-2 flex flex-wrap items-center gap-1">
					{(clamped || expanded) && (
						<Button
							aria-controls={detailsId}
							aria-expanded={expanded}
							onClick={() => setExpanded((open) => !open)}
							size="xs"
							variant="ghost"
						>
							<ChevronRight
								className={cn("transition-transform", expanded && "rotate-90")}
							/>
							{expanded ? (
								<Trans>Hide details</Trans>
							) : (
								<Trans>Show details</Trans>
							)}
						</Button>
					)}
					<CopyErrorButton
						text={[title, error?.message, error?.detail]
							.filter(Boolean)
							.join("\n\n")}
					/>
					{offered.map((button, index) => (
						<Button
							aria-expanded={button.expanded}
							className={index === 0 ? PRIMARY_CLASS : undefined}
							disabled={button.disabled}
							key={button.action}
							onClick={button.onClick}
							size="xs"
							variant="outline"
						>
							{button.label}
						</Button>
					))}
				</div>
			</div>
			{actions && (
				<button
					aria-label={t({ message: "Dismiss error" })}
					className="absolute top-2 right-2 rounded p-1 text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
					onClick={() => actions.setDismissed(turnId, true)}
					type="button"
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	);
}
