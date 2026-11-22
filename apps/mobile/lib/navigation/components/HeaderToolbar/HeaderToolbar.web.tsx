import { Stack } from "expo-router";
import { Check, type LucideIcon } from "lucide-react-native";
import { Pressable, View as RNView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { MENU_ICONS, TOOLBAR_ICONS } from "./constants";
import type {
	HeaderButtonProps,
	HeaderMenuActionProps,
	HeaderMenuProps,
	HeaderMenuSectionProps,
	HeaderSubmenuProps,
	HeaderToolbarComponent,
	HeaderToolbarProps,
	HeaderViewProps,
} from "./HeaderToolbar.types";

const ITEM_CLASS =
	"size-10 items-center justify-center rounded-full hover:bg-accent active:bg-accent";

function ItemIcon({ as, color }: { as: LucideIcon; color?: string }) {
	return color ? (
		<Icon as={as} color={color} className="size-5" />
	) : (
		<Icon as={as} className="text-foreground size-5" />
	);
}

function Button({
	icon,
	accessibilityLabel,
	onPress,
	hidden,
	disabled,
	variant,
	tintColor,
}: HeaderButtonProps) {
	if (hidden) return null;
	const prominent = variant === "prominent";
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			onPress={onPress}
			className={cn(
				ITEM_CLASS,
				prominent && !tintColor && "bg-primary",
				disabled && "opacity-40",
			)}
			style={prominent && tintColor ? { backgroundColor: tintColor } : null}
		>
			{icon ? (
				<ItemIcon
					as={TOOLBAR_ICONS[icon]}
					color={prominent ? "#ffffff" : tintColor}
				/>
			) : null}
		</Pressable>
	);
}

function Menu({ icon, accessibilityLabel, children }: HeaderMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={accessibilityLabel}
					className={ITEM_CLASS}
				>
					{icon ? <ItemIcon as={TOOLBAR_ICONS[icon]} /> : null}
				</Pressable>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function Submenu({ title, icon, children }: HeaderSubmenuProps) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<RNView className="flex-1 flex-row items-center gap-2">
					{icon ? <Icon as={MENU_ICONS[icon]} className="size-4" /> : null}
					<Text>{title}</Text>
				</RNView>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>{children}</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function MenuSection({ children }: HeaderMenuSectionProps) {
	return (
		<>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>{children}</DropdownMenuGroup>
		</>
	);
}

function MenuAction({
	icon,
	isOn,
	destructive,
	onPress,
	children,
}: HeaderMenuActionProps) {
	return (
		<DropdownMenuItem
			variant={destructive ? "destructive" : "default"}
			onPress={onPress}
		>
			{icon ? <Icon as={MENU_ICONS[icon]} className="size-4" /> : null}
			<Text className="flex-1">{children}</Text>
			{isOn ? <Icon as={Check} className="size-4" /> : null}
		</DropdownMenuItem>
	);
}

function Spacer() {
	return <RNView className="flex-1" />;
}

function View({ children }: HeaderViewProps) {
	return <>{children}</>;
}

function BottomBar({ children }: { children?: React.ReactNode }) {
	const insets = useSafeAreaInsets();
	return (
		<RNView
			pointerEvents="box-none"
			className="absolute inset-x-0 flex-row items-center gap-3 px-4"
			style={{ bottom: insets.bottom + 12 }}
		>
			{children}
		</RNView>
	);
}

function HeaderToolbarRoot({ placement, children }: HeaderToolbarProps) {
	if (placement === "bottom") return <BottomBar>{children}</BottomBar>;
	return (
		<Stack.Toolbar placement={placement} asChild>
			<RNView className="flex-row items-center gap-1 px-2">{children}</RNView>
		</Stack.Toolbar>
	);
}

export const HeaderToolbar: HeaderToolbarComponent = Object.assign(
	HeaderToolbarRoot,
	{ Button, Menu, Submenu, MenuSection, MenuAction, Spacer, View },
);
