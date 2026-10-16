import { fileThumbnail } from "@superset/composer";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { FileText } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAttachmentFile } from "../../hooks/useAttachmentFile";

const GLYPH_SIZE = 36;

export function AttachmentFileCard({
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
	const { data: uri } = useAttachmentFile({
		hostUrl,
		attachmentId,
		name,
		mediaType,
	});
	const { data: preview } = useQuery({
		queryKey: ["attachment-file-thumbnail", uri],
		enabled: uri !== undefined,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: () => (uri ? fileThumbnail(uri, GLYPH_SIZE) : null),
	});

	return (
		<View
			className="h-20 w-[159px] justify-between rounded-[9px] bg-white/5 p-[7px]"
			style={{ borderCurve: "continuous" }}
		>
			<View
				className="size-9 items-center justify-center overflow-hidden rounded-lg bg-white/10"
				style={{ borderCurve: "continuous" }}
			>
				{preview ? (
					<Image
						contentFit="cover"
						source={{ uri: preview }}
						style={{ width: "100%", height: "100%" }}
					/>
				) : (
					<Icon as={FileText} className="text-muted-foreground size-[14px]" />
				)}
			</View>
			<Text
				className="text-muted-foreground text-xs"
				ellipsizeMode="middle"
				numberOfLines={1}
			>
				{name}
			</Text>
		</View>
	);
}
