import { presentImage } from "@superset/composer";
import { Image } from "expo-image";
import { Pressable } from "react-native";
import { useAttachmentFile } from "../../hooks/useAttachmentFile";
import { AttachmentFileCard } from "../AttachmentFileCard";

export function AttachmentThumbnail({
	attachmentId,
	hostUrl,
	name,
	mediaType,
}: {
	attachmentId: string;
	hostUrl: string | undefined;
	name: string;
	mediaType: string;
}) {
	const { data: uri, isError } = useAttachmentFile({
		hostUrl,
		attachmentId,
		name,
		mediaType,
	});

	if (isError || !hostUrl) {
		return (
			<AttachmentFileCard
				attachmentId={attachmentId}
				hostUrl={undefined}
				mediaType={mediaType}
				name={name}
			/>
		);
	}
	return (
		<Pressable
			accessibilityLabel={name}
			accessibilityRole="imagebutton"
			className="size-20 overflow-hidden rounded-[10px] bg-white/10"
			disabled={!uri}
			onPress={() => uri && void presentImage(uri)}
			style={{ borderCurve: "continuous" }}
		>
			{uri ? (
				<Image
					contentFit="cover"
					source={{ uri }}
					style={{ width: "100%", height: "100%" }}
					transition={150}
				/>
			) : null}
		</Pressable>
	);
}
