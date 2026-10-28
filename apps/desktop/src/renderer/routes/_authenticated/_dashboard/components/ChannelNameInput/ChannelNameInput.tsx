import { CHANNEL_NAME_MAX_LENGTH } from "@superset/shared/channels";

interface ChannelNameInputProps {
	id: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

/** Slack's channel name field: a leading # and the characters left. */
export function ChannelNameInput({
	id,
	value,
	onChange,
	placeholder,
}: ChannelNameInputProps) {
	return (
		<div className="flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3 focus-within:ring-2 focus-within:ring-ring/50">
			<span className="text-muted-foreground">#</span>
			<input
				id={id}
				value={value}
				maxLength={CHANNEL_NAME_MAX_LENGTH}
				placeholder={placeholder}
				onChange={(event) =>
					onChange(event.target.value.toLowerCase().replace(/\s/g, "-"))
				}
				className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
			/>
			<span className="text-sm text-muted-foreground tabular-nums">
				{CHANNEL_NAME_MAX_LENGTH - value.length}
			</span>
		</div>
	);
}
