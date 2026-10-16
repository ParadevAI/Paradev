import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuX } from "react-icons/lu";
import type { GmailAddress } from "../../types";
import {
	byEmail,
	chipLabel,
	displayName,
	formatRecipient,
	parseRecipient,
	splitRecipients,
} from "../../utils/addresses";

const RECIPIENT_MIME = "application/x-gmail-recipient";

interface DraggedRecipient {
	address: GmailAddress;
	/** The reader typed this name, so it may show on the chip. */
	named: boolean;
}

interface RecipientFieldProps {
	label: string;
	value: GmailAddress[];
	onChange: (next: GmailAddress[]) => void;
	/** People already in the thread, offered as you type; only their names show on chips. */
	known: GmailAddress[];
	autoFocus?: boolean;
	trailing?: React.ReactNode;
}

/** Gmail's recipient line: chips for each address, typed ones confirmed on Enter, comma, Tab or leaving the field. */
export function RecipientField({
	label,
	value,
	onChange,
	known,
	autoFocus,
	trailing,
}: RecipientFieldProps) {
	const { t } = useLingui();
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState("");
	const [invalid, setInvalid] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	const [named, setNamed] = useState<ReadonlyMap<string, GmailAddress>>(
		new Map(),
	);
	const [dropping, setDropping] = useState(false);
	const source = `${RECIPIENT_MIME}-from-${id.replace(/[^a-z0-9]/gi, "")}`;
	useEffect(() => {
		if (autoFocus) input.current?.focus();
	}, [autoFocus]);

	const knownEmails = useMemo(
		() => new Map([...byEmail(known), ...named]),
		[known, named],
	);
	const taken = new Set(value.map((a) => a.email.toLowerCase()));
	const suggestions = useMemo(() => {
		const q = draft.trim().toLowerCase();
		if (!q) return [];
		return known
			.filter(
				(a) =>
					!taken.has(a.email.toLowerCase()) &&
					(a.email.toLowerCase().includes(q) ||
						(a.name ?? "").toLowerCase().includes(q)),
			)
			.slice(0, 6);
	}, [draft, known, taken]);

	const has = (list: GmailAddress[], address: GmailAddress) =>
		list.some((a) => a.email.toLowerCase() === address.email.toLowerCase());
	const add = (addresses: GmailAddress[]) => {
		const next = [...value];
		for (const address of addresses)
			if (!has(next, address)) next.push(address);
		onChange(next);
	};
	const remember = (addresses: GmailAddress[]) => {
		const typedNames = addresses.filter((a) => a.name);
		if (typedNames.length === 0) return;
		setNamed((current) => {
			const next = new Map(current);
			for (const a of typedNames) next.set(a.email.toLowerCase(), a);
			return next;
		});
	};
	/** Gmail keeps in the field what it can't add: text that isn't an address, and an address already there. */
	const commit = (text: string): boolean => {
		const parts = splitRecipients(text);
		if (parts.length === 0) return true;
		const parsed = parts.map(parseRecipient);
		const kept: string[] = [];
		const fresh: GmailAddress[] = [];
		parts.forEach((part, i) => {
			const address = parsed[i];
			if (!address || has(value, address) || has(fresh, address))
				kept.push(part);
			else fresh.push(address);
		});
		add(fresh);
		remember(fresh);
		setDraft(kept.join(", "));
		setInvalid(parsed.some((a) => a === null));
		return kept.length === 0;
	};
	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (
			suggestions.length > 0 &&
			(event.key === "ArrowDown" || event.key === "ArrowUp")
		) {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
			return;
		}
		if (
			(event.key === "Enter" || event.key === "Tab") &&
			suggestions[highlight]
		) {
			event.preventDefault();
			add([suggestions[highlight] as GmailAddress]);
			setSelected(null);
			setDraft("");
			setHighlight(0);
			return;
		}
		if (
			event.key === "Enter" ||
			event.key === "," ||
			event.key === ";" ||
			(event.key === "Tab" && draft.trim())
		) {
			if (draft.trim()) {
				event.preventDefault();
				commit(draft);
			}
			return;
		}
		if (event.key === "Backspace" && !draft && value.length > 0) {
			event.preventDefault();
			if (selected) {
				onChange(value.filter((a) => a.email !== selected));
				setSelected(null);
			} else setSelected(value[value.length - 1]?.email ?? null);
			return;
		}
		setSelected(null);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target for chips, which the keyboard moves by retyping
		<div
			className={cn(
				"relative flex min-h-9 items-center gap-2 border-b border-border px-3 text-[13px]",
				dropping && "bg-fill-hover",
			)}
			onDragOver={(event) => {
				const types = event.dataTransfer.types;
				if (!types.includes(RECIPIENT_MIME) || types.includes(source)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setDropping(true);
			}}
			onDragLeave={() => setDropping(false)}
			onDrop={(event) => {
				setDropping(false);
				const raw = event.dataTransfer.getData(RECIPIENT_MIME);
				if (!raw) return;
				event.preventDefault();
				const dragged = JSON.parse(raw) as DraggedRecipient;
				add([dragged.address]);
				if (dragged.named) remember([dragged.address]);
			}}
		>
			<label htmlFor={id} className="shrink-0 text-muted-foreground">
				{label}
			</label>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1">
				{value.map((address) => (
					<Tooltip key={address.email} delayDuration={400}>
						<TooltipTrigger asChild>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: dragging a chip to Cc or Bcc; its × and retyping cover the keyboard */}
							<span
								draggable
								onDragStart={(event) => {
									const dragged: DraggedRecipient = {
										address,
										named: named.has(address.email.toLowerCase()),
									};
									event.dataTransfer.setData(
										RECIPIENT_MIME,
										JSON.stringify(dragged),
									);
									event.dataTransfer.setData(source, "");
									event.dataTransfer.effectAllowed = "move";
								}}
								onDragEnd={(event) => {
									if (event.dataTransfer.dropEffect === "move")
										onChange(value.filter((a) => a.email !== address.email));
								}}
								className={cn(
									"group/chip inline-flex h-6 max-w-full cursor-grab items-center gap-1 rounded-full border border-border bg-muted/50 pr-1 pl-2.5 text-[12.5px] text-foreground hover:bg-fill-hover",
									selected === address.email &&
										"border-primary bg-fill-selected",
								)}
							>
								<span className="truncate">
									{chipLabel(address, knownEmails)}
								</span>
								<button
									type="button"
									aria-label={t({ message: `Remove ${displayName(address)}` })}
									onClick={() =>
										onChange(value.filter((a) => a.email !== address.email))
									}
									className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-fill-selected hover:text-foreground"
								>
									<LuX className="size-3" />
								</button>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">
							{formatRecipient(address)}
						</TooltipContent>
					</Tooltip>
				))}
				<input
					ref={input}
					id={id}
					value={draft}
					onChange={(event) => {
						setSelected(null);
						setDraft(event.target.value);
						setInvalid(false);
						setHighlight(0);
					}}
					onKeyDown={onKeyDown}
					onBlur={() => {
						if (draft.trim()) commit(draft);
					}}
					onPaste={(event) => {
						const text = event.clipboardData.getData("text");
						if (splitRecipients(text).length > 1) {
							event.preventDefault();
							commit(text);
						}
					}}
					className={cn(
						"h-6 min-w-24 flex-1 bg-transparent text-[13px] text-foreground outline-none",
						invalid && "text-destructive underline decoration-wavy",
					)}
				/>
			</div>
			{trailing}
			{suggestions.length > 0 && (
				<div
					role="listbox"
					className="absolute top-full left-10 z-20 mt-1 w-80 rounded-lg border border-border bg-popover p-1 shadow-lg"
				>
					{suggestions.map((address, index) => (
						<button
							key={address.email}
							type="button"
							role="option"
							aria-selected={index === highlight}
							onMouseDown={(event) => event.preventDefault()}
							onMouseEnter={() => setHighlight(index)}
							onClick={() => {
								add([address]);
								setDraft("");
							}}
							className={cn(
								"flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left",
								index === highlight && "bg-fill-selected",
							)}
						>
							<span className="text-[13px] text-foreground">
								{displayName(address)}
							</span>
							{address.name && (
								<span className="text-xs text-muted-foreground">
									{address.email}
								</span>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
