import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import {
	LuFlag,
	LuHeart,
	LuLeaf,
	LuLightbulb,
	LuPlane,
	LuSandwich,
	LuSearch,
	LuSmile,
	LuVolleyball,
} from "react-icons/lu";
import type { CategoryId } from "../../utils/pickerSections";

const ICONS: Record<CategoryId, IconType> = {
	people: LuSmile,
	nature: LuLeaf,
	food: LuSandwich,
	travel: LuPlane,
	activities: LuVolleyball,
	objects: LuLightbulb,
	symbols: LuHeart,
	flags: LuFlag,
};

interface CategoryTabsProps {
	categories: CategoryId[];
	active: CategoryId | "search";
	labels: Record<CategoryId, string>;
	onSelect: (id: CategoryId | "search") => void;
}

/** Slack's tab row: search, then one tab per category the picker holds. */
export function CategoryTabs({
	categories,
	active,
	labels,
	onSelect,
}: CategoryTabsProps) {
	const { t } = useLingui();
	const tab = (
		id: CategoryId | "search",
		label: string,
		icon: React.ReactNode,
	) => (
		<button
			key={id}
			type="button"
			role="tab"
			aria-label={label}
			aria-selected={active === id}
			title={label}
			onMouseDown={(event) => event.preventDefault()}
			onClick={() => onSelect(id)}
			className={cn(
				"flex h-10 w-[34px] shrink-0 items-center justify-center border-b-2 text-muted-foreground hover:text-foreground",
				active === id
					? "border-foreground text-foreground"
					: "border-transparent",
			)}
		>
			{icon}
		</button>
	);
	return (
		<div
			role="tablist"
			className="flex shrink-0 items-end border-b border-border px-2.5"
		>
			{tab(
				"search",
				t({ message: "Search" }),
				<LuSearch className="size-[18px]" />,
			)}
			{categories.map((id) => {
				const Icon = ICONS[id];
				return tab(id, labels[id], <Icon className="size-[18px]" />);
			})}
		</div>
	);
}
