import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { LinkedText } from "../../../../../LinkedText";
import type { GmailMessageView } from "../../../../types";
import {
	emailDocument,
	prepareEmailHtml,
	splitQuotedText,
} from "../../../../utils/emailHtml";
import { QuoteToggle } from "../../../QuoteToggle";
import { EmailFrame } from "./components/EmailFrame";

interface MessageBodyProps {
	message: GmailMessageView;
	gmailUrl: string;
	onMailto?: (href: string) => void;
}

function textSized(html: string): string {
	return `<div style="font-size:13px;line-height:19.5px">${html}</div>`;
}

function isDark(): boolean {
	return document.documentElement.classList.contains("dark");
}

/** An open message's body: its HTML in a sandbox, or its text, with the quoted part folded behind "•••". */
export function MessageBody({ message, gmailUrl, onMailto }: MessageBodyProps) {
	const { t } = useLingui();
	const [showQuoted, setShowQuoted] = useState(false);
	const prepared = useMemo(
		() => (message.html ? prepareEmailHtml(message.html) : null),
		[message.html],
	);
	const split = useMemo(
		() => (!prepared && message.text ? splitQuotedText(message.text) : null),
		[prepared, message.text],
	);

	if (prepared) {
		const html =
			showQuoted || !prepared.trimmed ? prepared.full : prepared.trimmed;
		const dark = isDark();
		const srcDoc = emailDocument(prepared.designed ? html : textSized(html), {
			designed: prepared.designed,
			foreground: dark ? "#e8eaed" : "#202124",
			link: dark ? "#8ab4f8" : "#1a73e8",
			imageOrigin: new URL(env.NEXT_PUBLIC_API_URL).origin,
		});
		return (
			<div className="min-w-0">
				<div
					className={cn(
						prepared.designed &&
							"overflow-hidden rounded-lg border border-border bg-white",
					)}
				>
					<EmailFrame
						srcDoc={srcDoc}
						title={t({ message: "Email body" })}
						onMailto={onMailto}
					/>
				</div>
				{message.clipped && (
					<p className="mt-2 text-[13px] text-muted-foreground">
						<Trans>[Message clipped]</Trans>{" "}
						<a
							href={gmailUrl}
							target="_blank"
							rel="noreferrer"
							className="text-[#1a73e8] hover:underline dark:text-[#8ab4f8]"
						>
							<Trans>View entire message</Trans>
						</a>
					</p>
				)}
				{prepared.trimmed && (
					<QuoteToggle
						open={showQuoted}
						onToggle={() => setShowQuoted((v) => !v)}
					/>
				)}
			</div>
		);
	}

	const body = split?.body ?? message.snippet;
	return (
		<div className="min-w-0 text-[13px] leading-[19.5px] text-foreground">
			<div className="whitespace-pre-wrap break-words">
				<LinkedText text={body} onMailto={onMailto} />
			</div>
			{split?.quoted && (
				<>
					<QuoteToggle
						open={showQuoted}
						onToggle={() => setShowQuoted((v) => !v)}
					/>
					{showQuoted && (
						<div className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
							<LinkedText text={split.quoted} onMailto={onMailto} />
						</div>
					)}
				</>
			)}
		</div>
	);
}
