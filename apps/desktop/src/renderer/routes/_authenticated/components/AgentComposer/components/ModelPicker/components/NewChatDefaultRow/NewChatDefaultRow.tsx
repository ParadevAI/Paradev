import { Trans } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { LuCheck } from "react-icons/lu";
import { MENU_ROW_CLASS } from "../../../../constants";
import type { NewChatDefaults } from "../../types";

function optionLabel(option: SessionConfigOption | undefined, id?: string) {
	return option?.options.find((entry) => entry.id === id)?.label ?? id;
}

export function NewChatDefaultRow({
	defaults,
	effort,
	model,
}: {
	defaults: NewChatDefaults;
	effort: SessionConfigOption | undefined;
	model: SessionConfigOption | undefined;
}) {
	const { value, onChange } = defaults;
	const hasDefault = Boolean(value.modelId || value.effortId);
	const isDefault =
		hasDefault &&
		value.modelId === model?.currentValue &&
		value.effortId === effort?.currentValue;
	const savedLabel = [
		optionLabel(model, value.modelId),
		optionLabel(effort, value.effortId),
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<DropdownMenuItem
			aria-checked={isDefault}
			className={MENU_ROW_CLASS}
			onSelect={(event) => {
				event.preventDefault();
				onChange(
					isDefault
						? {}
						: {
								...(model?.currentValue ? { modelId: model.currentValue } : {}),
								...(effort?.currentValue
									? { effortId: effort.currentValue }
									: {}),
							},
				);
			}}
			role="menuitemcheckbox"
		>
			<span className="min-w-0 flex-1 truncate">
				<Trans>Use for new chats</Trans>
			</span>
			{isDefault ? (
				<LuCheck className="size-3.5 shrink-0" />
			) : hasDefault ? (
				<span className="max-w-32 truncate text-muted-foreground">
					{savedLabel}
				</span>
			) : null}
		</DropdownMenuItem>
	);
}
