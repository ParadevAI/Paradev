import { Trans } from "@lingui/react/macro";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

interface InboxCardPageProps {
	title: string;
	why: string;
	/** Who sent the card: a person, an agent or Superset, and the workspace it came from. */
	sender: { name: string; mark?: ReactNode; workspace?: string } | null;
	body?: string | null;
	/** The card's document: its prose, questions and integration cards with their actions. */
	children?: ReactNode;
	/** Set once the card is settled. */
	outcome: { label: string; note?: string } | null;
}

/** The page every card has, built from what the card carries when it was sent with no page of its own. */
export function InboxCardPage({
	title,
	why,
	sender,
	body,
	children,
	outcome,
}: InboxCardPageProps) {
	return (
		<article className="mx-auto flex max-w-2xl flex-col gap-4 px-8 py-10">
			<h1 className="text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
				{title}
			</h1>
			<p className="-mt-1 text-[15px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
				“{why}”
			</p>
			{sender && (
				<p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<span className="shrink-0">
						<Trans>From</Trans>
					</span>
					{sender.mark}
					<span className="truncate text-foreground/90">
						{[sender.name, sender.workspace].filter(Boolean).join(" · ")}
					</span>
				</p>
			)}
			{body && (
				<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
					{body}
				</p>
			)}
			{children}
			{outcome && (
				<p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground">
					<Check className="size-3.5 shrink-0 text-success" />
					<span className="font-medium">{outcome.label}</span>
					{outcome.note && (
						<span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
							{outcome.note}
						</span>
					)}
				</p>
			)}
		</article>
	);
}
