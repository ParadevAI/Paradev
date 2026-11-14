import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { HeaderToolbar } from "@/lib/navigation";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";

export function OrganizationHeaderButton({
	name,
	logo,
	isLoading,
	onPress,
}: {
	name?: string;
	logo?: string | null;
	isLoading?: boolean;
	onPress: () => void;
}) {
	// Naming an organization we have not loaded yet would be a guess, and the
	// guess is wrong for everyone who belongs to more than one.
	if (isLoading) return null;
	return (
		<HeaderToolbar placement="left">
			<HeaderToolbar.View>
				<Pressable
					onPress={onPress}
					className="flex-row items-center gap-2 py-1.5 pl-1.5 pr-3.5"
				>
					<OrganizationAvatar name={name} logo={logo} size={26} />
					<Text className="text-base font-semibold text-foreground">
						{name ?? "Organization"}
					</Text>
				</Pressable>
			</HeaderToolbar.View>
		</HeaderToolbar>
	);
}
