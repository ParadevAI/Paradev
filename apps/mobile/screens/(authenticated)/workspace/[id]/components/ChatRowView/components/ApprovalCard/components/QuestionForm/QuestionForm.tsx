import { Trans, useLingui } from "@lingui/react/macro";
import {
	answerText,
	type FormValues,
	isInvalidNumber,
	isPageAnswered,
	questionPages,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	FormField,
} from "@superset/chat/protocol";
import { MessageCircleQuestion } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { AskerLabel } from "../AskerLabel";
import { QuestionPage } from "./components/QuestionPage";

export function QuestionForm({
	approval,
	form,
	asker,
	onRespond,
}: {
	approval: ApprovalRequest;
	form: NonNullable<ApprovalRequest["form"]>;
	asker?: string | undefined;
	onRespond: (approvalId: string, decision: Decision) => Promise<void>;
}) {
	const { t } = useLingui();
	const pages = useMemo(() => questionPages(form.fields), [form.fields]);
	const [values, setValues] = useState<FormValues>({});
	const [pageIndex, setPageIndex] = useState(0);
	const [sending, setSending] = useState(false);
	const index = Math.min(pageIndex, Math.max(pages.length - 1, 0));
	const page = pages[index];
	const last = index >= pages.length - 1;
	const several = pages.length > 1;

	const respond = (decision: Decision) => {
		setSending(true);
		void onRespond(approval.id, decision).finally(() => setSending(false));
	};

	const blocked = pages.some(
		(entry) =>
			(entry.field.required && !isPageAnswered(entry, values)) ||
			isInvalidNumber(entry.field, values[entry.field.id]),
	);
	const submit = () => {
		if (blocked || sending) return;
		const filled = Object.fromEntries(
			Object.entries(values)
				.map(([key, value]) => [
					key,
					typeof value === "string" ? value.trim() : value,
				])
				.filter(([, value]) => answerText(value) !== ""),
		);
		respond({ type: "form", values: filled });
	};
	const next = () => (last ? submit() : setPageIndex(index + 1));

	const choicesFor = (field: FormField) =>
		field.input === "boolean"
			? [
					{ value: "true", label: t`Yes` },
					{ value: "false", label: t`No` },
				]
			: (field.options ?? []);

	const pick = (value: string) => {
		if (!page) return;
		const { field } = page;
		if (field.input === "multi") {
			setValues((current) => {
				const picked = Array.isArray(current[field.id])
					? (current[field.id] as string[])
					: [];
				return {
					...current,
					[field.id]: picked.includes(value)
						? picked.filter((entry) => entry !== value)
						: [...picked, value],
				};
			});
			return;
		}
		const unpick = values[field.id] === value;
		setValues((current) => ({ ...current, [field.id]: unpick ? "" : value }));
		if (!unpick && !last) setPageIndex(index + 1);
	};

	return (
		<View className="w-full gap-3 rounded-xl border border-white/10 bg-[#1C1C1C] p-3">
			{asker ? <AskerLabel name={asker} /> : null}
			{several ? (
				<View className="flex-row gap-1">
					{pages.map((entry, entryIndex) => (
						<Pressable
							accessibilityLabel={entry.field.title ?? String(entryIndex + 1)}
							accessibilityRole="button"
							accessibilityState={{ selected: entryIndex === index }}
							className="flex-1 py-1"
							hitSlop={6}
							key={entry.field.id}
							onPress={() => setPageIndex(entryIndex)}
						>
							<View
								className={cn(
									"h-1 rounded-full",
									entryIndex === index
										? "bg-foreground"
										: isPageAnswered(entry, values)
											? "bg-foreground/40"
											: "bg-foreground/10",
								)}
							/>
						</Pressable>
					))}
				</View>
			) : null}
			<View className="flex-row items-center gap-2">
				<Icon
					as={MessageCircleQuestion}
					className="text-muted-foreground size-3.5"
				/>
				<Text
					className="text-muted-foreground min-w-0 flex-1 text-xs font-medium uppercase tracking-wider"
					numberOfLines={1}
				>
					{page?.field.title ?? <Trans>Question</Trans>}
					{page?.field.required ? (
						<Text className="text-muted-foreground/70 text-xs normal-case tracking-normal">
							{"  "}
							<Trans>Required</Trans>
						</Text>
					) : null}
				</Text>
				{several ? (
					<Text className="text-muted-foreground text-xs tabular-nums">
						<Trans context="question progress">
							{index + 1} of {pages.length}
						</Trans>
					</Text>
				) : null}
			</View>
			{page ? (
				<QuestionPage
					choices={choicesFor(page.field)}
					disabled={sending}
					key={page.field.id}
					onEnter={next}
					onPick={pick}
					onType={(fieldId, text) =>
						setValues((current) => ({ ...current, [fieldId]: text }))
					}
					page={page}
					question={page.field.description ?? form.message}
					values={values}
				/>
			) : (
				<Text className="text-foreground text-[15px] font-medium leading-snug">
					{form.message}
				</Text>
			)}
			<View className="flex-row items-center gap-2 border-t border-white/10 pt-3">
				<Pressable
					accessibilityRole="button"
					className={cn(
						"rounded-md px-3 py-1.5 active:opacity-70",
						sending && "opacity-50",
					)}
					disabled={sending}
					onPress={() => respond({ type: "decline" })}
				>
					<Text className="text-muted-foreground text-[13px] font-medium">
						<Trans>Skip</Trans>
					</Text>
				</Pressable>
				<View className="ml-auto flex-row items-center gap-2">
					{index > 0 ? (
						<Pressable
							accessibilityRole="button"
							className="rounded-md bg-white/10 px-3 py-1.5 active:opacity-70"
							disabled={sending}
							onPress={() => setPageIndex(index - 1)}
						>
							<Text className="text-foreground text-[13px] font-medium">
								<Trans>Back</Trans>
							</Text>
						</Pressable>
					) : null}
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ disabled: sending || (last && blocked) }}
						className={cn(
							"rounded-md bg-white px-3 py-1.5 active:opacity-70",
							(sending || (last && blocked)) && "opacity-50",
						)}
						disabled={sending || (last && blocked)}
						onPress={next}
					>
						<Text className="text-[13px] font-medium text-black">
							{last ? <Trans>Submit</Trans> : <Trans>Next</Trans>}
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}
