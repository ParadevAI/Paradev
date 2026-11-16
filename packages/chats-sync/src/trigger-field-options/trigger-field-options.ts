import type {
	ApiTriggerField,
	ApiTriggerOption,
} from "../api-types/api-types.ts";

/** An account's choices for a trigger type's fields, by field name (`composioAccountOptions`). */
export type TriggerFieldOptions = Record<string, ApiTriggerOption[]>;

/** The type's fields with the account's choices on the ones that have any. */
export function withFieldOptions(
	fields: ApiTriggerField[],
	options: TriggerFieldOptions,
): ApiTriggerField[] {
	return fields.map((f) =>
		options[f.name]?.length ? { ...f, options: options[f.name] } : f,
	);
}

/**
 * What a picker for the field offers, or null when it takes free text (no choices came). An optional field can be
 * left empty ("Any"); a saved value the list no longer has (a team since removed, an id typed in the CLI) stays
 * pickable under its id, so opening a trigger never changes it.
 */
export function fieldChoices(
	field: ApiTriggerField,
	value: string,
): ApiTriggerOption[] | null {
	if (field.type !== "string" || !field.options?.length) return null;
	const choices = [
		...(field.required ? [] : [{ value: "", label: "Any" }]),
		...field.options,
	];
	return value && !choices.some((c) => c.value === value)
		? [...choices, { value, label: value }]
		: choices;
}
