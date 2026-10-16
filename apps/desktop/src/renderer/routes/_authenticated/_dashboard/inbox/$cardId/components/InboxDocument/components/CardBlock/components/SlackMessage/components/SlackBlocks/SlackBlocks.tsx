import type { SlackBlockView } from "../../types";
import { Mrkdwn } from "../Mrkdwn";
import { RichTextBlock } from "../RichTextBlock";
import { SlackButton } from "../SlackButton";

interface SlackBlocksProps {
	blocks: SlackBlockView[];
	permalink: string | null;
}

/** The Block Kit a message is made of: a person's rich_text, an app's sections, context and buttons. */
export function SlackBlocks({ blocks, permalink }: SlackBlocksProps) {
	return (
		<div className="mt-1 flex max-w-xl flex-col gap-2 text-[13px] leading-relaxed text-foreground">
			{blocks.map((block, index) => {
				const key = `${block.type}-${index}`;
				switch (block.type) {
					case "rich_text":
						return <RichTextBlock key={key} block={block} />;
					case "header":
						return (
							<div key={key} className="text-[15px] font-bold">
								{block.text}
							</div>
						);
					case "section":
						return (
							<div key={key} className="flex gap-3">
								<div className="min-w-0 flex-1">
									{block.text && <Mrkdwn text={block.text} />}
									{block.fields.length > 0 && (
										<div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1">
											{block.fields.map((field) => (
												<div key={field}>
													<Mrkdwn text={field} />
												</div>
											))}
										</div>
									)}
								</div>
								{block.accessory && (
									<img
										src={block.accessory}
										alt=""
										className="size-16 shrink-0 rounded-md object-cover"
									/>
								)}
							</div>
						);
					case "context":
						return (
							<div
								key={key}
								className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
							>
								{block.elements.map((element, i) =>
									element.kind === "image" ? (
										<img
											key={`${element.url}-${i}`}
											src={element.url}
											alt={element.alt}
											className="size-4 rounded-sm"
										/>
									) : (
										<span key={`${element.text}-${i}`}>
											<Mrkdwn text={element.text} />
										</span>
									),
								)}
							</div>
						);
					case "divider":
						return <hr key={key} className="border-border" />;
					case "image":
						return (
							<figure key={key} className="flex flex-col gap-1">
								{block.title && (
									<figcaption className="text-xs text-muted-foreground">
										{block.title}
									</figcaption>
								)}
								<img
									src={block.url}
									alt={block.alt}
									className="max-h-72 rounded-md border border-border"
								/>
							</figure>
						);
					case "actions":
						return (
							<div key={key} className="flex flex-wrap gap-2">
								{block.buttons.map((button) => (
									<SlackButton
										key={button.text}
										button={button}
										permalink={permalink}
									/>
								))}
							</div>
						);
					default:
						return null;
				}
			})}
		</div>
	);
}
