import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	inviteSuggestions,
	isEmail,
	pickableIndexes,
	pickOf,
	type SuggestionItem,
	stagedKey,
} from "@superset/shared/sharing";
import { ChevronLeft } from "lucide-react";
import {
	type ClipboardEvent,
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "../../../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../ui/select";
import { toast } from "../../../ui/sonner";
import type {
	InviteNewMode,
	ShareAddRequest,
	ShareDirectory,
	ShareGrantee,
	ShareGranteeRef,
	ShareRoleOption,
	StagedPick,
} from "../../types";
import { InviteSuggestion } from "./components/InviteSuggestion";
import { StagedChip } from "./components/StagedChip";

interface InviteViewProps {
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	ownerId: string | null;
	organizationName: string;
	inviteNew: InviteNewMode;
	roles: ShareRoleOption[];
	defaultRole: string;
	/** What the people added get, when there is only one role. */
	roleNote: string;
	/** Typed on the main view before it switched here. */
	initialQuery: string;
	onAdd: (request: ShareAddRequest) => Promise<void>;
	onUpgrade: () => void;
	onBack: () => void;
	onDone: () => void;
}

export function InviteView({
	directory,
	grantees,
	ownerId,
	organizationName,
	inviteNew,
	roles,
	defaultRole,
	roleNote,
	initialQuery,
	onAdd,
	onUpgrade,
	onBack,
	onDone,
}: InviteViewProps) {
	const { t } = useLingui();
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState(initialQuery);
	const [staged, setStaged] = useState<StagedPick[]>([]);
	const [active, setActive] = useState(0);
	const [navigating, setNavigating] = useState(false);
	const [inviteError, setInviteError] = useState(false);
	const [role, setRole] = useState(defaultRole);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const input = inputRef.current;
		input?.focus();
		input?.setSelectionRange(input.value.length, input.value.length);
	}, []);

	const items = useMemo(
		() =>
			inviteSuggestions({
				query,
				directory,
				grantees,
				staged,
				ownerId,
				inviteNew,
			}),
		[query, directory, grantees, staged, ownerId, inviteNew],
	);
	const pickable = pickableIndexes(items);
	const activeIndex = pickable[active] ?? null;
	const highlighted = query.trim() || navigating ? activeIndex : null;

	const clearQuery = () => {
		setQuery("");
		setActive(0);
		setNavigating(false);
		setInviteError(false);
	};

	const toggle = (pick: StagedPick) => {
		const key = stagedKey(pick);
		setStaged((current) =>
			current.some((p) => stagedKey(p) === key)
				? current.filter((p) => stagedKey(p) !== key)
				: [...current, pick],
		);
		if (query) clearQuery();
		inputRef.current?.focus();
	};

	const pick = (item: SuggestionItem | undefined) => {
		if (!item) return;
		if (item.kind === "invalid") {
			setInviteError(true);
			return;
		}
		if (item.kind === "invite" && inviteNew === "upgrade") {
			onUpgrade();
			return;
		}
		const next = pickOf(item);
		if (next) toggle(next);
	};

	const fill = (email: string) => {
		setQuery(email);
		setActive(0);
		setInviteError(false);
		inputRef.current?.focus();
	};

	const submit = async () => {
		if (!staged.length || busy) return;
		setBusy(true);
		try {
			await onAdd({
				grantees: staged.flatMap((p): ShareGranteeRef[] =>
					p.kind === "user"
						? [{ kind: "user", userId: p.person.userId }]
						: p.kind === "team"
							? [{ kind: "team", teamId: p.team.teamId }]
							: [],
				),
				emails: staged.flatMap((p) => (p.kind === "email" ? [p.email] : [])),
				role,
			});
			onDone();
		} catch (error) {
			toast.error(errorMessage(error, t({ message: "Could not share" })));
			setBusy(false);
		}
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" && pickable.length) {
			event.preventDefault();
			setActive((current) =>
				navigating ? (current + 1) % pickable.length : 0,
			);
			setNavigating(true);
		} else if (event.key === "ArrowUp" && pickable.length) {
			event.preventDefault();
			setActive((current) => (current - 1 + pickable.length) % pickable.length);
			setNavigating(true);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (event.metaKey || event.ctrlKey) void submit();
			else if (highlighted !== null) pick(items[highlighted]);
			else if (!query.trim()) void submit();
		} else if (event.key === "Tab" && highlighted !== null) {
			const item = items[highlighted];
			if (item?.kind === "invite" && item.completion && !item.selected) {
				event.preventDefault();
				fill(item.email);
			}
		} else if (event.key === "Backspace" && !query && staged.length) {
			setStaged((current) => current.slice(0, -1));
		}
	};

	const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
		const text = event.clipboardData.getData("text");
		if (!text.includes("@") || !/[\s,;]/.test(text.trim())) return;
		event.preventDefault();
		const memberByEmail = new Map(
			directory.members.map((m) => [m.email.toLowerCase(), m]),
		);
		const picks: StagedPick[] = [];
		let blocked = 0;
		for (const raw of text.split(/[\s,;]+/)) {
			const email = raw.trim().toLowerCase();
			if (!isEmail(email)) continue;
			const person = memberByEmail.get(email);
			if (person) {
				if (person.userId !== ownerId) picks.push({ kind: "user", person });
			} else if (inviteNew === "allowed") {
				picks.push({ kind: "email", email });
			} else {
				blocked += 1;
			}
		}
		setStaged((current) => {
			const keys = new Set(current.map(stagedKey));
			const added = picks.filter((p) => {
				const key = stagedKey(p);
				if (keys.has(key)) return false;
				keys.add(key);
				return true;
			});
			return [...current, ...added];
		});
		if (blocked && inviteNew === "upgrade") onUpgrade();
		else if (blocked) {
			toast.message(
				t({
					message: `Skipped ${blocked} not in ${organizationName}. Only admins can invite new people.`,
				}),
			);
		}
	};

	const newPeople = staged.some((p) => p.kind === "email");

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape from any control in the view goes back
		<div
			data-share-invite=""
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				if (query) clearQuery();
				else onBack();
			}}
		>
			<div className="flex items-center gap-1 px-1.5 py-1.5">
				<Button
					size="icon-xs"
					variant="ghost"
					onClick={onBack}
					aria-label={t({ message: "Back" })}
				>
					<ChevronLeft className="size-4" />
				</Button>
				<span className="font-medium text-sm">
					<Trans>Invite</Trans>
				</span>
			</div>
			<div className="border-t px-3 pt-2.5 pb-1">
				<div className="flex items-start gap-2">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the field's padding focuses its input */}
					<div
						className="flex min-h-9 min-w-0 flex-1 cursor-text items-start gap-1 rounded-md border bg-transparent py-1 pr-1 pl-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
						onMouseDown={(event) => {
							if (event.target === event.currentTarget) {
								event.preventDefault();
								inputRef.current?.focus();
							}
						}}
					>
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
							{staged.map((p) => (
								<StagedChip
									key={stagedKey(p)}
									pick={p}
									onRemove={() => toggle(p)}
								/>
							))}
							<input
								ref={inputRef}
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setActive(0);
									setInviteError(false);
								}}
								onKeyDown={onKeyDown}
								onPaste={onPaste}
								placeholder={
									staged.length
										? t({ message: "Add more…" })
										: t({ message: "Name, email, or team" })
								}
								aria-label={t({ message: "Add people" })}
								role="combobox"
								aria-expanded
								aria-controls={listId}
								autoComplete="off"
								spellCheck={false}
								className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
							/>
						</div>
						{roles.length > 1 ? (
							<Select value={role} onValueChange={setRole}>
								<SelectTrigger
									size="sm"
									className="h-6 shrink-0 border-none bg-transparent px-1.5 text-muted-foreground text-xs shadow-none hover:text-foreground dark:bg-transparent dark:hover:bg-accent"
									aria-label={t({ message: "Access for the people you add" })}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="end">
									{roles.map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<span className="shrink-0 px-1.5 py-1 text-muted-foreground text-xs">
								{roleNote}
							</span>
						)}
					</div>
					<Button
						size="sm"
						className="h-9"
						disabled={!staged.length || busy}
						onClick={() => void submit()}
					>
						{newPeople ? <Trans>Invite</Trans> : <Trans>Share</Trans>}
					</Button>
				</div>
				<div
					id={listId}
					role="listbox"
					aria-multiselectable
					className="-mx-1 mt-1.5 max-h-80 overflow-y-auto pb-1.5"
					onMouseDown={(event) => event.preventDefault()}
				>
					{items.map((item, index) => (
						<InviteSuggestion
							key={
								item.kind === "member"
									? `user:${item.person.userId}`
									: item.kind === "team"
										? `team:${item.team.teamId}`
										: item.kind === "invite"
											? `email:${item.email}`
											: `${item.kind}-${index}`
							}
							item={item}
							active={index === highlighted}
							organizationName={organizationName}
							inviteError={inviteError}
							browsing={!query.trim()}
							onPick={() => pick(item)}
						/>
					))}
				</div>
				{newPeople ? (
					<p className="-mx-3 border-t px-3 py-2 text-muted-foreground text-xs">
						<Trans>
							New people get an email invite to {organizationName}. They see
							this once they join.
						</Trans>
					</p>
				) : null}
			</div>
		</div>
	);
}
