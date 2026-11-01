import type { SessionConfigOption } from "@superset/chat/protocol";
import { codexPickerModels } from "@superset/shared/agent-models";
import { useEffect, useMemo, useRef } from "react";

interface Options {
	enabled: boolean;
	blocked: boolean;
	configOptions: SessionConfigOption[] | undefined;
	selectedIds: readonly string[] | null;
	onSelect: (configId: string, value: string) => Promise<void>;
	onError: (error: unknown) => void;
}

export function useCodexPickerOptions({
	enabled,
	blocked,
	configOptions,
	selectedIds,
	onSelect,
	onError,
}: Options) {
	const options = useMemo(
		() =>
			(configOptions ?? []).map((option) => {
				if (!enabled || option.category !== "model") return option;
				return {
					...option,
					options: codexPickerModels(option.options, selectedIds),
				};
			}),
		[configOptions, enabled, selectedIds],
	);
	const requested = useRef<string | null>(null);
	useEffect(() => {
		const model = options.find((option) => option.category === "model");
		if (
			!enabled ||
			!model ||
			model.options.some((option) => option.id === model.currentValue)
		) {
			requested.current = null;
			return;
		}
		if (blocked) return;
		const nextModel = model.options[0]?.id;
		const request = `${model.currentValue}:${nextModel}`;
		if (!nextModel || requested.current === request) return;
		requested.current = request;
		void onSelect(model.id, nextModel).catch((error: unknown) => {
			requested.current = null;
			onError(error);
		});
	}, [blocked, enabled, onError, onSelect, options]);
	return options;
}
