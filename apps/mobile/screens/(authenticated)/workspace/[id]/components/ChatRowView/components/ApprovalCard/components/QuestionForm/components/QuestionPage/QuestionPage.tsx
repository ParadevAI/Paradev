import { Trans, useLingui } from "@lingui/react/macro";
import {
	answerText,
	type FormValues,
	isInvalidNumber,
	type QuestionPage as Page,
} from "@superset/chat/core";
import type { FormField } from "@superset/chat/protocol";
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type Choice = NonNullable<FormField["options"]>[number];

export function QuestionPage({
	page,
	question,
	choices,
	values,
	disabled,
	onPick,
	onType,
	onEnter,
}: {
	page: Page;
	question: string;
	choices: Choice[];
	values: FormValues;
	disabled: boolean;
	onPick: (value: string) => void;
	onType: (fieldId: string, text: string) => void;
	onEnter: () => void;
}) {
	const { t } = useLingui();
	const { field, other } = page;
	const multi = field.input === "multi";
	const numeric = field.input === "number" || field.input === "integer";
	const freeform = field.input === "text" || numeric;
	const current = values[field.id];
	const isPicked = (value: string) =>
		Array.isArray(current) ? current.includes(value) : current === value;
	const textField = freeform ? field : other;
	const textValue = textField ? values[textField.id] : undefined;
	const invalid = isInvalidNumber(field, values[field.id]);

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="text-foreground text-[15px] font-medium leading-snug">
					{question}
				</Text>
				{multi ? (
					<Text className="text-muted-foreground text-xs">
						<Trans>Select all that apply</Trans>
					</Text>
				) : null}
			</View>
			<View className="gap-1">
				{choices.map((option) => {
					const picked = isPicked(option.value);
					return (
						<Pressable
							accessibilityRole={multi ? "checkbox" : "radio"}
							accessibilityState={{ checked: picked, disabled }}
							className={cn(
								"flex-row items-start gap-3 rounded-lg border px-3 py-2.5 active:bg-white/5",
								picked
									? "border-white/25 bg-white/[0.07]"
									: "border-transparent",
							)}
							disabled={disabled}
							key={option.value}
							onPress={() => onPick(option.value)}
						>
							<View
								className={cn(
									"mt-px size-[18px] items-center justify-center border",
									multi ? "rounded-[5px]" : "rounded-full",
									picked
										? "border-foreground bg-foreground"
										: "border-muted-foreground/40",
								)}
							>
								{picked ? (
									<Icon as={Check} className="text-background size-3" />
								) : null}
							</View>
							<View className="min-w-0 flex-1">
								<Text className="text-foreground text-[14px] font-medium leading-5">
									{option.label}
								</Text>
								{option.description ? (
									<Text className="text-muted-foreground text-xs leading-relaxed">
										{option.description}
									</Text>
								) : null}
							</View>
						</Pressable>
					);
				})}
				{textField ? (
					<Input
						accessibilityLabel={
							textField.description ?? textField.title ?? t`Other`
						}
						className="mt-1 bg-black/40"
						editable={!disabled}
						keyboardType={
							field.input === "integer"
								? "number-pad"
								: field.input === "number"
									? "decimal-pad"
									: "default"
						}
						onChangeText={(text) => onType(textField.id, text)}
						onSubmitEditing={onEnter}
						placeholder={
							field.input === "integer"
								? t`Enter a whole number`
								: field.input === "number"
									? t`Enter a number`
									: freeform
										? t`Type your answer`
										: multi
											? t`Something else? Add it here`
											: t`Something else? Type your own answer`
						}
						returnKeyType="done"
						value={
							typeof textValue === "string" ? textValue : answerText(textValue)
						}
					/>
				) : null}
				{invalid ? (
					<Text className="text-destructive px-3 text-xs">
						{field.input === "integer" ? (
							<Trans>Enter a whole number</Trans>
						) : (
							<Trans>Enter a number</Trans>
						)}
					</Text>
				) : null}
			</View>
		</View>
	);
}
