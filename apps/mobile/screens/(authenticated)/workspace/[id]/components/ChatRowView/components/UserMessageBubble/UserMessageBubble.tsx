import { Trans } from "@lingui/react/macro";
import { readBookkeeping, userMessageText } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { CircleAlert } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SystemLine } from "../SystemLine";
import { AttachmentFileCard } from "./components/AttachmentFileCard";
import { AttachmentThumbnail } from "./components/AttachmentThumbnail";
import { OutgoingBubble } from "./components/OutgoingBubble";

/** What the composer's native viewer can decode; UIImage has no SVG. */
function isViewableImage(mimeType: string): boolean {
	return mimeType.startsWith("image/") && mimeType !== "image/svg+xml";
}

interface UserMessageBubbleProps {
	content: UserContent[];
	harness: string | undefined;
	hostUrl?: string;
	pending?: {
		failed: boolean;
		onRetry: () => void;
		onDiscard: () => void;
	};
}

export function UserMessageBubble({
	content,
	harness,
	hostUrl,
	pending,
}: UserMessageBubbleProps) {
	const text = userMessageText({ content });
	const note = pending ? null : readBookkeeping(harness, text);
	if (note) return <SystemLine>{note.label}</SystemLine>;

	const attachments = content.flatMap((part) =>
		part.type === "attachment" ? [part] : [],
	);
	const failed = pending?.failed === true;
	return (
		<View className="items-end gap-1">
			<View className="flex-row items-center justify-end gap-2">
				{failed ? (
					<Pressable
						accessibilityRole="button"
						hitSlop={8}
						onPress={pending?.onRetry}
					>
						<Icon as={CircleAlert} className="text-destructive size-5" />
					</Pressable>
				) : null}
				<OutgoingBubble
					className={
						attachments.length > 0
							? "w-[82%] gap-2 px-[13px] pt-[11px]"
							: undefined
					}
					dimmed={pending !== undefined}
				>
					{attachments.length > 0 ? (
						<ScrollView
							contentContainerClassName="gap-2"
							horizontal
							showsHorizontalScrollIndicator={false}
						>
							{attachments.map((attachment) =>
								isViewableImage(attachment.mimeType) ? (
									<AttachmentThumbnail
										attachmentId={attachment.attachmentId}
										hostUrl={hostUrl}
										key={attachment.attachmentId}
										mediaType={attachment.mimeType}
										name={attachment.name}
									/>
								) : (
									<AttachmentFileCard
										attachmentId={attachment.attachmentId}
										hostUrl={hostUrl}
										key={attachment.attachmentId}
										mediaType={attachment.mimeType}
										name={attachment.name}
									/>
								),
							)}
						</ScrollView>
					) : null}
					{text ? (
						<Text
							className="text-foreground text-[17px] leading-[24px]"
							selectable
						>
							{text}
						</Text>
					) : null}
				</OutgoingBubble>
			</View>
			{pending ? (
				<View className="flex-row items-center justify-end gap-3 pr-1">
					{failed ? (
						<>
							<Text className="text-destructive text-[11px] font-medium">
								<Trans>Not sent</Trans>
							</Text>
							<Pressable
								accessibilityRole="button"
								hitSlop={8}
								onPress={pending.onRetry}
							>
								<Text className="text-foreground text-[11px] font-semibold">
									<Trans>Retry</Trans>
								</Text>
							</Pressable>
							<Pressable
								accessibilityRole="button"
								hitSlop={8}
								onPress={pending.onDiscard}
							>
								<Text className="text-muted-foreground text-[11px]">
									<Trans>Discard</Trans>
								</Text>
							</Pressable>
						</>
					) : (
						<Text className="text-muted-foreground text-[11px]">
							<Trans>Sending…</Trans>
						</Text>
					)}
				</View>
			) : null}
		</View>
	);
}
