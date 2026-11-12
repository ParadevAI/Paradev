import { Trans, useLingui } from "@lingui/react/macro";
import { isUsageLimitMessage, type TurnError } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { ChevronRight, Gauge, X } from "lucide-react";
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
	MANUAL_SIGN_IN_ACTIONS,
	MANUAL_SIGN_IN_TITLE,
	TONES,
} from "./constants";

type Running = "continue" | "restart" | "new_chat";

type ActionButton = {
	label: ReactNode;
	onClick: () => void;
	disabled: boolean;
	expanded?: boolean;
};

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
	const router = useRouter({ warn: false });
	const hostKind = error?.kind ?? "unknown";
	const kind =
		hostKind === "unknown" && isUsageLimitMessage(error?.message ?? "")
			? "usage_limit"
			: hostKind;
	const limit = kind === "usage_limit";
	const tone = TONES[limit ? "limit" : "failure"];
	const manualSignIn = kind === "auth" && actions?.manualSignIn === true;
	const title = i18n._(
		manualSignIn ? MANUAL_SIGN_IN_TITLE : FAILURE_TITLES[kind],
	);
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
				<tone.Icon className={cn("size-3.5 shrink-0", tone.collapsedIcon)} />
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
				usage_settings: {
					label: <Trans>Usage settings</Trans>,
					disabled: false,
					onClick: () => void router?.navigate({ to: "/settings/usage" }),
				},
				agent_settings: recovery.openAgentSettings
					? {
							label: <Trans>Agent settings</Trans>,
							disabled: false,
							onClick: recovery.openAgentSettings,
						}
					: null,
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
		? (manualSignIn ? MANUAL_SIGN_IN_ACTIONS : FAILURE_ACTIONS[kind]).flatMap(
				(action) => {
					const button = buttons[action];
					return button ? [{ action, ...button }] : [];
				},
			)
		: [];

	const copyError = (
		<CopyErrorButton
			text={[title, error?.message, error?.detail].filter(Boolean).join("\n\n")}
		/>
	);
	const offeredButtons = offered.map((button, index) => (
		<Button
			aria-expanded={button.expanded}
			className={index === 0 ? tone.primary : undefined}
			disabled={button.disabled}
			key={button.action}
			onClick={button.onClick}
			size="xs"
			variant="outline"
		>
			{button.label}
		</Button>
	));

	return (
		<div
			className={cn(
				"relative flex w-full max-w-[36rem] gap-2.5 rounded-lg border py-2.5 pr-9 pl-3 font-sans text-xs",
				tone.card,
			)}
			data-turn-failure={kind}
			role={limit ? "status" : "alert"}
		>
			{limit ? (
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
					<Gauge className="size-3.5" />
				</span>
			) : (
				<tone.Icon className={cn("mt-0.5 size-4 shrink-0", tone.icon)} />
			)}
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div
					className={cn(
						"font-medium text-sm",
						limit ? "leading-6" : "leading-5",
						tone.title,
					)}
				>
					{title}
				</div>
				{limit && (
					<p className="text-muted-foreground leading-5">
						<Trans>
							Your model provider stopped this request because the account
							reached its usage or spend limit. Wait for the limit to reset,
							raise it with your provider, or switch to another account in Usage
							settings.
						</Trans>
					</p>
				)}
				{text && (!limit || expanded) && (
					<p
						className={cn(
							"wrap-anywhere whitespace-pre-wrap font-mono text-[12px] text-foreground/70 leading-5",
							expanded ? "max-h-60 overflow-y-auto" : "line-clamp-3",
							limit && "order-last rounded-md bg-muted/50 px-2 py-1.5",
						)}
						id={detailsId}
						ref={textRef}
						tabIndex={expanded ? 0 : undefined}
					>
						{text}
					</p>
				)}
				{limit && expanded && (
					<div className="-ml-2 order-last">{copyError}</div>
				)}
				{manualSignIn && (
					<p className="text-muted-foreground">
						<Trans>
							In manual mode, Paradev doesn't sign this agent in. Have your
							script sign it in again and continue, or turn off manual mode in
							agent settings.
						</Trans>
					</p>
				)}
				{signingIn && recovery && !manualSignIn && (
					<SignInCommand command={error?.loginCommand} />
				)}
				{newChatFailed && (
					<p className="text-destructive">
						<Trans>Couldn't start a new chat.</Trans>
					</p>
				)}
				<div
					className={cn(
						"flex flex-wrap items-center gap-1",
						limit ? "mt-0.5" : "-ml-2",
					)}
				>
					{limit && offeredButtons}
					{(limit ? Boolean(text) : clamped || expanded) && (
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
					{!limit && copyError}
					{!limit && offeredButtons}
				</div>
			</div>
			{actions && (
				<button
					aria-label={t({ message: "Dismiss error" })}
					className={cn(
						"absolute top-2 right-2 rounded p-1 transition-colors",
						tone.dismiss,
					)}
					onClick={() => actions.setDismissed(turnId, true)}
					type="button"
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	);
}
