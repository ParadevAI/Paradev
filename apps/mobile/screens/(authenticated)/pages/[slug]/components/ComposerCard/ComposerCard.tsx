import type { ReactNode } from "react";
import { View } from "react-native";
import { GlassSurface } from "@/components/GlassSurface";

export function ComposerCard({ children }: { children: ReactNode }) {
	const content = <View className="gap-2 px-4 pb-3 pt-4">{children}</View>;
	return (
		<GlassSurface
			radius={28}
			fallbackClassName="bg-secondary border-border overflow-hidden rounded-[28px] border"
			style={{ overflow: "hidden" }}
		>
			{content}
		</GlassSurface>
	);
}
