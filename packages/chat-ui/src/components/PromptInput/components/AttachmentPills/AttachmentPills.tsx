"use client";

import { Trans } from "@lingui/react/macro";
import { AttachmentFileCard } from "../../../AttachmentFileCard";
import {
	PASTED_TEXT_ACTION_CLASS,
	PastedTextCard,
} from "../../../PastedTextCard";
import type { PromptInputAttachment } from "../../types";
import type { PastedTextEntry } from "../../utils/pasteUndo";
import { RemoveButton } from "./components/RemoveButton";

export type AttachmentPillsProps = {
	attachments: PromptInputAttachment[];
	pastedTexts?: PastedTextEntry[];
	onRemove: (id: string) => void;
	onShowPastedText?: (id: string) => void;
	onRemovePastedText?: (id: string) => void;
	onPreviewError?: (id: string) => void;
	onAttachmentClick?: (
		attachment: PromptInputAttachment,
		attachments: readonly PromptInputAttachment[],
	) => void;
};

export function AttachmentPills({
	attachments,
	pastedTexts = [],
	onRemove,
	onShowPastedText,
	onRemovePastedText,
	onPreviewError,
	onAttachmentClick,
}: AttachmentPillsProps) {
	if (attachments.length === 0 && pastedTexts.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-2 px-3 pt-3">
			{attachments.map((attachment) => {
				const filename = attachment.file.name || "attachment";
				if (attachment.previewUrl) {
					return (
						<div key={attachment.id} className="relative shrink-0">
							<button
								type="button"
								aria-label={filename}
								className="group/attachment relative block size-16 cursor-pointer overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
								onClick={() => onAttachmentClick?.(attachment, attachments)}
							>
								{attachment.file.type.startsWith("video/") ? (
									<video
										src={attachment.previewUrl}
										muted
										className="size-full object-cover"
										onError={() => onPreviewError?.(attachment.id)}
									/>
								) : (
									<img
										src={attachment.previewUrl}
										alt={filename}
										className="size-full object-cover"
										draggable={false}
										onError={() => onPreviewError?.(attachment.id)}
									/>
								)}
								<span className="pointer-events-none absolute inset-0 bg-foreground/[0.02] opacity-0 transition-opacity duration-150 group-hover/attachment:opacity-100" />
							</button>
							<RemoveButton onClick={() => onRemove(attachment.id)} />
						</div>
					);
				}
				return (
					<div key={attachment.id} className="relative shrink-0">
						<AttachmentFileCard
							name={filename}
							mediaType={attachment.file.type}
							onClick={() => onAttachmentClick?.(attachment, attachments)}
						/>
						<RemoveButton onClick={() => onRemove(attachment.id)} />
					</div>
				);
			})}
			{pastedTexts.map((entry) => (
				<PastedTextCard
					key={entry.id}
					text={entry.text}
					onRemove={() => onRemovePastedText?.(entry.id)}
					action={
						<button
							type="button"
							className={PASTED_TEXT_ACTION_CLASS}
							onClick={() => onShowPastedText?.(entry.id)}
						>
							<Trans>Show in text field</Trans>
						</button>
					}
				/>
			))}
		</div>
	);
}
