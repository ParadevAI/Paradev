"use client";

import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Button } from "../../../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../../ui/dialog";
import { Label } from "../../../ui/label";
import { RadioGroup, RadioGroupItem } from "../../../ui/radio-group";
import type { PageToolAnswer, PageToolPrompt } from "../../hooks/usePageTools";
import { armAfter } from "./utils/armAfter";
import { consentCopy } from "./utils/consentCopy";

interface PageToolConsentDialogProps {
	pageTitle: string;
	prompt: PageToolPrompt | null;
	onAnswer: (answer: PageToolAnswer) => void;
	armDelayMs?: number;
}

export function PageToolConsentDialog({
	pageTitle,
	prompt,
	onAnswer,
	armDelayMs = 500,
}: PageToolConsentDialogProps) {
	const { i18n } = useLingui();
	const [selected, setSelected] = useState<string | null>(null);
	const [armed, setArmed] = useState(false);

	useEffect(() => {
		setArmed(false);
		if (!prompt) return;
		return armAfter(armDelayMs, () => setArmed(true));
	}, [prompt, armDelayMs]);

	if (!prompt) return null;

	const accounts = prompt.kind === "account" ? prompt.accounts : [];
	const connectionId =
		accounts.find((account) => account.connectionId === selected)
			?.connectionId ?? accounts[0]?.connectionId;

	const descriptors = consentCopy(prompt, pageTitle);
	const copy = {
		title: i18n._(descriptors.title),
		body: i18n._(descriptors.body),
		allow: i18n._(descriptors.allow),
		deny: i18n._(descriptors.deny),
	};

	const allow = () =>
		onAnswer(
			prompt.kind === "account"
				? { allow: true, connectionId }
				: { allow: true },
		);

	return (
		<Dialog
			open
			modal
			onOpenChange={(open) => {
				if (!open) onAnswer({ allow: false });
			}}
		>
			<DialogContent
				onEscapeKeyDown={(event) => {
					event.preventDefault();
					onAnswer({ allow: false });
				}}
			>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>{copy.body}</DialogDescription>
				</DialogHeader>
				{prompt.kind === "account" ? (
					<RadioGroup
						value={connectionId}
						onValueChange={setSelected}
						aria-label={copy.title}
					>
						{accounts.map((account) => (
							<div
								key={account.connectionId}
								className="flex items-center gap-2"
							>
								<RadioGroupItem
									id={`page-tool-account-${account.connectionId}`}
									value={account.connectionId}
								/>
								<Label htmlFor={`page-tool-account-${account.connectionId}`}>
									{account.label}
								</Label>
							</div>
						))}
					</RadioGroup>
				) : null}
				<DialogFooter>
					<Button
						variant="outline"
						disabled={!armed}
						onClick={() => onAnswer({ allow: false })}
					>
						{copy.deny}
					</Button>
					<Button
						onClick={allow}
						disabled={!armed || (prompt.kind === "account" && !connectionId)}
					>
						{copy.allow}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
