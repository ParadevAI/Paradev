import { View } from "react-native";
import { AsciiSpinner } from "@/screens/(authenticated)/components/AsciiSpinner";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";

/** A row's attention marker, for a collapsed header that hides the row. */
export function AttentionMark({ attention }: { attention: TerminalAttention }) {
	if (attention === "working") return <AsciiSpinner />;
	if (attention === "permission") return <PingDot color="#eab308" size={7} />;
	if (attention === "failed") return <PingDot color="#ef4444" size={7} />;
	return <View className="bg-green-500 size-2 rounded-full" />;
}
