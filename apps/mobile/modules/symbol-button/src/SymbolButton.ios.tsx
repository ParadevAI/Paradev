import { requireNativeView } from "expo";
import type {
	SymbolButtonComponent,
	SymbolButtonProps,
} from "./SymbolButton.types";

type NativeSymbolButtonProps = Omit<
	SymbolButtonProps,
	"onPress" | "onSelect"
> & {
	onTap?: () => void;
	onSelect?: (event: { nativeEvent: { id: string } }) => void;
};

const NativeSymbolButton =
	requireNativeView<NativeSymbolButtonProps>("SymbolButton");

export const SymbolButton: SymbolButtonComponent = ({
	onSelect,
	onPress,
	...props
}) => (
	<NativeSymbolButton
		{...props}
		onTap={onPress}
		onSelect={(event) => onSelect?.(event.nativeEvent.id)}
	/>
);
