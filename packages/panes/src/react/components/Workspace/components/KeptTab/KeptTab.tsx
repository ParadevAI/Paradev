import {
	type ComponentProps,
	type CSSProperties,
	memo,
	useDeferredValue,
} from "react";
import { TabVisibilityContext } from "../../../../hooks/useIsTabVisible";
import { Tab } from "../Tab";

// Unlike display:none, this keeps the hidden tab's layout, so its resize
// observers see no 0-size and its scroll offsets survive.
const HIDDEN_TAB_STYLE: CSSProperties = {
	contentVisibility: "hidden",
	pointerEvents: "none",
};

const MemoTab = memo(Tab) as typeof Tab;

type KeptTabProps<TData> = ComponentProps<typeof Tab<TData>> & {
	isVisible: boolean;
};

function KeptTabView<TData>({ isVisible, ...tabProps }: KeptTabProps<TData>) {
	// Panes hear about the switch in a render after the switch is painted.
	const isPaneVisible = useDeferredValue(isVisible);
	return (
		<div
			className="absolute inset-0 flex"
			style={isVisible ? undefined : HIDDEN_TAB_STYLE}
			inert={!isVisible}
			aria-hidden={isVisible ? undefined : true}
		>
			<TabVisibilityContext.Provider value={isPaneVisible}>
				<MemoTab {...tabProps} />
			</TabVisibilityContext.Provider>
		</div>
	);
}

export const KeptTab = memo(KeptTabView) as typeof KeptTabView;
