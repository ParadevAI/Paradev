import type { SlackAttachmentView } from "../../types";
import { Mrkdwn } from "../Mrkdwn";
import { SlackBlocks } from "../SlackBlocks";
import { SlackButton } from "../SlackButton";
import { CollapsibleText } from "./components/CollapsibleText";
import { SlackLinkPreview } from "./components/SlackLinkPreview";
import { SlackUnfurl } from "./components/SlackUnfurl";

interface SlackAttachmentProps {
	attachment: SlackAttachmentView;
	/** "As of …" for an unfurl: when Slack fetched it, the message's own time. */
	asOf: string;
	/** The footer's time, in the words the message header uses. */
	sentAt: string | null;
	permalink: string | null;
}

/** An app's attachment as Slack lays it out: the colored bar, then title, text, fields and footer. */
export function SlackAttachment({
	attachment: a,
	asOf,
	sentAt,
	permalink,
}: SlackAttachmentProps) {
	if (a.link) {
		return <SlackLinkPreview link={a.link} />;
	}
	if (a.unfurl) {
		return <SlackUnfurl unfurl={a.unfurl} asOf={asOf} />;
	}
	return (
		<div className="mt-1 flex max-w-xl flex-col gap-1 text-[13px] leading-relaxed">
			{a.pretext && (
				<div className="text-foreground">
					<Mrkdwn text={a.pretext} />
				</div>
			)}
			<div className="flex gap-3">
				<span
					className="w-1 shrink-0 rounded-full bg-border"
					style={a.color ? { backgroundColor: a.color } : undefined}
				/>
				<div className="flex min-w-0 flex-col gap-1 py-0.5">
					{a.author && (
						<span className="flex items-center gap-1.5 font-bold text-foreground">
							{a.author.icon && (
								<img src={a.author.icon} alt="" className="size-4 rounded-sm" />
							)}
							{a.author.name}
						</span>
					)}
					{a.title && (
						<span className="font-semibold">
							<Mrkdwn
								text={
									a.titleLink && !a.title.includes("<")
										? `<${a.titleLink}|${a.title}>`
										: a.title
								}
							/>
						</span>
					)}
					{a.text && (
						<CollapsibleText>
							<Mrkdwn text={a.text} />
						</CollapsibleText>
					)}
					{a.fields.length > 0 && (
						<div className="grid grid-cols-2 gap-x-6 gap-y-1">
							{a.fields.map((f) => (
								<div
									key={f.title + f.value}
									className={f.short ? "" : "col-span-2"}
								>
									<div className="font-semibold text-foreground">{f.title}</div>
									<div className="text-foreground">
										<Mrkdwn text={f.value} />
									</div>
								</div>
							))}
						</div>
					)}
					{a.blocks.length > 0 && (
						<SlackBlocks blocks={a.blocks} permalink={permalink} />
					)}
					{a.image && (
						<img
							src={a.image}
							alt=""
							className="mt-1 max-h-72 rounded-md border border-border"
						/>
					)}
					{(a.footer || sentAt) && (
						<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground [&_a]:text-muted-foreground">
							{a.footerIcon && (
								<img src={a.footerIcon} alt="" className="size-4 rounded-sm" />
							)}
							{a.footer && <Mrkdwn text={a.footer} />}
							{a.footer && sentAt && <span aria-hidden>|</span>}
							{sentAt && <span>{sentAt}</span>}
						</span>
					)}
					{a.buttons.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-2">
							{a.buttons.map((button) => (
								<SlackButton
									key={button.text}
									button={button}
									permalink={permalink}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
