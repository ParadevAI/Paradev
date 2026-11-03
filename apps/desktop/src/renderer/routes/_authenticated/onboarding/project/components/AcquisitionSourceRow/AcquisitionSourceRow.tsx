import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiXMark } from "react-icons/hi2";
import {
	ACQUISITION_SOURCE_OTHER_MAX_LENGTH,
	type AcquisitionSource,
	type AcquisitionSourceAnswer,
	AI_ACQUISITION_SOURCES,
	EMPTY_ACQUISITION_SOURCE_ANSWER,
	isAcquisitionSource,
	OTHER_ACQUISITION_SOURCES,
} from "../../utils/acquisitionSource";

const SOURCE_LABELS: Record<AcquisitionSource, MessageDescriptor | string> = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	perplexity: "Perplexity",
	gemini: "Gemini",
	other_ai_assistant: msg({ message: "Another AI assistant" }),
	search_engine: msg({ message: "Google or another search engine" }),
	friend_or_colleague: msg({ message: "A friend or colleague" }),
	x_twitter: "X (Twitter)",
	reddit: "Reddit",
	youtube: "YouTube",
	product_hunt: "Product Hunt",
	hacker_news: "Hacker News",
	github: "GitHub",
	newsletter_or_blog: msg({ message: "A newsletter or blog" }),
	other: msg({ message: "Other" }),
};

interface AcquisitionSourceRowProps {
	value: AcquisitionSourceAnswer;
	onChange: (value: AcquisitionSourceAnswer) => void;
	disabled?: boolean;
}

export function AcquisitionSourceRow({
	value,
	onChange,
	disabled,
}: AcquisitionSourceRowProps) {
	const { t, i18n } = useLingui();
	const question = t`How did you hear about Paradev?`;

	const labelText = (label: MessageDescriptor | string) =>
		typeof label === "string" ? label : i18n._(label);

	const renderItems = (keys: readonly AcquisitionSource[]) =>
		keys.map((key) => (
			<SelectItem key={key} value={key}>
				{labelText(SOURCE_LABELS[key])}
			</SelectItem>
		));

	return (
		<div className="flex flex-col gap-2 border-border border-t pt-5">
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground text-sm">{question}</p>
					<p className="text-muted-foreground text-xs">
						{t`Optional. Helps us learn what works.`}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<Select
						value={value.source ?? ""}
						disabled={disabled}
						onValueChange={(next) => {
							if (isAcquisitionSource(next)) {
								onChange({ ...value, source: next });
							}
						}}
					>
						<SelectTrigger
							size="sm"
							className="w-auto min-w-48 px-2"
							aria-label={question}
						>
							<SelectValue placeholder={t`Choose one`} />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectLabel>{t`AI assistants`}</SelectLabel>
								{renderItems(AI_ACQUISITION_SOURCES)}
							</SelectGroup>
							<SelectSeparator />
							<SelectGroup>
								{renderItems(OTHER_ACQUISITION_SOURCES)}
							</SelectGroup>
						</SelectContent>
					</Select>
					{value.source && (
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							className="text-muted-foreground"
							disabled={disabled}
							aria-label={t`Clear answer`}
							onClick={() => onChange(EMPTY_ACQUISITION_SOURCE_ANSWER)}
						>
							<HiXMark className="size-4" />
						</Button>
					)}
				</div>
			</div>
			{value.source === "other" && (
				<Input
					autoFocus
					value={value.otherText}
					maxLength={ACQUISITION_SOURCE_OTHER_MAX_LENGTH}
					disabled={disabled}
					onChange={(e) => onChange({ ...value, otherText: e.target.value })}
					placeholder={t`Where? (optional)`}
					aria-label={t`Where did you hear about Paradev?`}
				/>
			)}
		</div>
	);
}
