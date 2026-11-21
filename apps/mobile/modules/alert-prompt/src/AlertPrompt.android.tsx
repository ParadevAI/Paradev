import {
	AlertDialog,
	Host,
	Text,
	TextButton,
	TextField,
	type TextFieldRef,
	useNativeState,
} from "@expo/ui/jetpack-compose";
import { useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { useComposeHostTheme } from "@/hooks/useComposeHostTheme";
import type {
	AlertPromptHostComponent,
	Prompt,
	PromptOptions,
} from "./AlertPrompt.types";
import { enqueuePrompt, settlePrompt, usePendingPrompt } from "./promptQueue";

export const prompt: Prompt = enqueuePrompt;

export const AlertPromptHost: AlertPromptHostComponent = () => {
	const pending = usePendingPrompt();
	const hostTheme = useComposeHostTheme();
	if (!pending) return null;
	return (
		<Host
			{...hostTheme}
			style={{ position: "absolute", width: 0, height: 0 }}
			pointerEvents="none"
		>
			<PromptDialog key={pending.id} options={pending.options} />
		</Host>
	);
};

function PromptDialog({ options }: { options: PromptOptions }) {
	const { t } = useLingui();
	const value = useNativeState(options.defaultValue ?? "");
	const text = useRef(options.defaultValue ?? "");
	const fieldRef = useRef<TextFieldRef>(null);
	const confirm = () => settlePrompt(text.current);
	const cancel = () => settlePrompt(null);

	return (
		<AlertDialog onDismissRequest={cancel}>
			<AlertDialog.Title>
				<Text style={{ typography: "headlineSmall" }}>{options.title}</Text>
			</AlertDialog.Title>
			<AlertDialog.Text>
				<TextField
					ref={fieldRef}
					autoFocus
					singleLine
					value={value}
					keyboardOptions={{ imeAction: "done" }}
					keyboardActions={{ onDone: confirm }}
					onValueChange={(value) => {
						text.current = value;
					}}
					onFocusChanged={(focused) => {
						if (focused && options.selectText) {
							void fieldRef.current?.setSelection(0, text.current.length);
						}
					}}
				>
					{options.message ? (
						<TextField.SupportingText>
							<Text>{options.message}</Text>
						</TextField.SupportingText>
					) : null}
					{options.placeholder ? (
						<TextField.Placeholder>
							<Text>{options.placeholder}</Text>
						</TextField.Placeholder>
					) : null}
				</TextField>
			</AlertDialog.Text>
			<AlertDialog.DismissButton>
				<TextButton onClick={cancel}>
					<Text>{options.cancelText ?? t({ message: "Cancel" })}</Text>
				</TextButton>
			</AlertDialog.DismissButton>
			<AlertDialog.ConfirmButton>
				<TextButton onClick={confirm}>
					<Text>{options.confirmText ?? t({ message: "OK" })}</Text>
				</TextButton>
			</AlertDialog.ConfirmButton>
		</AlertDialog>
	);
}
