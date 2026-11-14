export interface ActionSheetOptions {
	options: string[];
	cancelButtonIndex?: number;
	destructiveButtonIndex?: number;
	/** A view's React tag the iPad popover points at. */
	anchor?: number;
}

export type ShowActionSheet = (
	options: ActionSheetOptions,
	onSelect: (index: number) => void,
) => void;
