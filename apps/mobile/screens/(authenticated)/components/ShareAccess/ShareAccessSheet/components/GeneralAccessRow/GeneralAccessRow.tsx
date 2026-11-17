import { useLingui } from "@lingui/react/macro";
import type { ShareRoleOption } from "@superset/shared/sharing";
import { ChevronDown, ChevronsUpDown } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { OrganizationAvatar } from "../../../../OrganizationAvatar";
import type { GeneralAccess } from "../../../types";

export function GeneralAccessRow({
	general,
	roles,
	canManage,
	onOpenWho,
	onOpenLevel,
}: {
	general: GeneralAccess;
	roles: ShareRoleOption[];
	canManage: boolean;
	onOpenWho: () => void;
	onOpenLevel: () => void;
}) {
	const { t } = useLingui();
	const current =
		general.options.find((option) => option.value === general.value) ??
		general.options[0];
	if (!current) return null;
	const role =
		general.value === "just_me"
			? undefined
			: general.role
				? (roles.find((option) => option.id === general.role?.value) ??
					roles[0])
				: roles.length === 1
					? roles[0]
					: undefined;
	const roleIsChoice = canManage && general.role && roles.length > 1;

	return (
		<View className="min-h-14 flex-row items-center gap-3 py-2">
			{current.organization ? (
				<OrganizationAvatar
					name={current.organization.name}
					logo={current.organization.logo}
					size={36}
				/>
			) : (
				<View className="bg-muted size-9 shrink-0 items-center justify-center rounded-lg">
					<Icon as={current.icon} className="text-foreground size-[18px]" />
				</View>
			)}
			<View className="min-w-0 flex-1 items-start">
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Who can open it" })}
					disabled={!canManage}
					onPress={onOpenWho}
					hitSlop={8}
					className="max-w-full flex-row items-center gap-1 active:opacity-60"
				>
					<Text className="shrink text-base" numberOfLines={1}>
						{current.label}
					</Text>
					{canManage ? (
						<Icon
							as={ChevronsUpDown}
							className="text-muted-foreground size-3.5"
						/>
					) : null}
				</Pressable>
			</View>
			{role ? (
				roleIsChoice ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t({ message: "What general access allows" })}
						onPress={onOpenLevel}
						hitSlop={8}
						className="shrink-0 flex-row items-center gap-1 active:opacity-60"
					>
						<Text className="text-muted-foreground text-sm">{role.label}</Text>
						<Icon as={ChevronDown} className="text-muted-foreground size-3.5" />
					</Pressable>
				) : (
					<Text className="text-muted-foreground shrink-0 text-sm">
						{role.label}
					</Text>
				)
			) : null}
		</View>
	);
}
