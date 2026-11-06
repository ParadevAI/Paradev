import { Button } from "@expo/ui/swift-ui";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	type InviteNewMode,
	inviteSuggestions,
	pickOf,
	type ShareAddRequest,
	type ShareDirectory,
	type ShareGrantee,
	type ShareGranteeRef,
	type ShareRoleOption,
	type StagedPick,
	type SuggestionItem,
	stagedKey,
} from "@superset/shared/sharing";
import * as Haptics from "expo-haptics";
import {
	type NativeStackNavigationProp,
	Stack,
	useNavigation,
	useRouter,
} from "expo-router";
import { Lock, UserPlus, Users } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { ValueMenu } from "../components/ValueMenu";
import { SuggestionRow } from "./components/SuggestionRow";

interface ShareInviteScreenProps {
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	ownerId: string | null;
	organizationName: string;
	inviteNew: InviteNewMode;
	roles: ShareRoleOption[];
	defaultRole: string;
	onUpgrade: () => void;
	/** Shares with one role's worth of picks; resolves true once they have access. */
	onSubmit: (request: ShareAddRequest) => Promise<boolean>;
}

export function ShareInviteScreen({
	directory,
	grantees,
	ownerId,
	organizationName,
	inviteNew,
	roles,
	defaultRole,
	onUpgrade,
	onSubmit,
}: ShareInviteScreenProps) {
	const { t } = useLingui();
	const router = useRouter();
	const navigation =
		useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
	const theme = useTheme();
	const searchBarRef = useRef<SearchBarCommands>(null);
	const [query, setQuery] = useState("");
	const [staged, setStaged] = useState<StagedPick[]>([]);
	const [pickRoles, setPickRoles] = useState<Record<string, string>>({});
	const [inviteError, setInviteError] = useState(false);
	const [busy, setBusy] = useState(false);

	// The search bar only exists once the push has finished.
	useEffect(
		() =>
			navigation.addListener("transitionEnd", (event) => {
				if (!event.data.closing) searchBarRef.current?.focus();
			}),
		[navigation],
	);

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

	const roleOf = (pick: StagedPick) =>
		pickRoles[stagedKey(pick)] ?? defaultRole;

	const toggle = (pick: StagedPick) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		const key = stagedKey(pick);
		setStaged((current) =>
			current.some((p) => stagedKey(p) === key)
				? current.filter((p) => stagedKey(p) !== key)
				: [...current, pick],
		);
		setInviteError(false);
		if (query) {
			searchBarRef.current?.clearText();
			setQuery("");
		}
	};

	const submit = async () => {
		if (!staged.length || busy) return;
		setBusy(true);
		const groups = [...new Set(staged.map(roleOf))];
		let shared = true;
		for (const role of groups) {
			const picks = staged.filter((pick) => roleOf(pick) === role);
			shared = await onSubmit({
				grantees: picks.flatMap((p): ShareGranteeRef[] =>
					p.kind === "user"
						? [{ kind: "user", userId: p.person.userId }]
						: p.kind === "team"
							? [{ kind: "team", teamId: p.team.teamId }]
							: [],
				),
				emails: picks.flatMap((p) => (p.kind === "email" ? [p.email] : [])),
				role,
			});
			if (!shared) break;
			const done = new Set(picks.map(stagedKey));
			setStaged((current) => current.filter((p) => !done.has(stagedKey(p))));
		}
		setBusy(false);
		if (shared) router.back();
	};

	const newPeople = staged.some((p) => p.kind === "email");
	const pickCount = staged.length;

	const roleMenu = (item: SuggestionItem) => {
		const pick = pickOf(item);
		if (!pick || roles.length < 2) return null;
		const key = stagedKey(pick);
		const current =
			roles.find((option) => option.id === roleOf(pick)) ?? roles[0];
		return (
			<ValueMenu
				label={current?.label}
				a11yLabel={t({ message: "Access for this person" })}
				size={14}
				chevron="chevron.up.chevron.down"
			>
				{roles.map((option) => (
					<Button
						key={option.id}
						label={option.label}
						systemImage={option.id === current?.id ? "checkmark" : undefined}
						onPress={() =>
							setPickRoles((all) => ({ ...all, [key]: option.id }))
						}
					/>
				))}
			</ValueMenu>
		);
	};

	return (
		<>
			<Stack.Screen
				options={{
					title: pickCount
						? t({ message: `Invite (${pickCount})` })
						: t({ message: "Invite" }),
				}}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityLabel={
						newPeople ? t({ message: "Invite" }) : t({ message: "Share" })
					}
					icon="checkmark"
					variant={staged.length ? "prominent" : "plain"}
					disabled={!staged.length || busy}
					onPress={() => void submit()}
				/>
			</Stack.Toolbar>
			<Stack.SearchBar
				ref={searchBarRef}
				placeholder={t({ message: "Names, emails, or teams" })}
				placement="stacked"
				hideWhenScrolling={false}
				hideNavigationBar={false}
				obscureBackground={false}
				autoCapitalize="none"
				inputType="email"
				textColor={theme.foreground}
				hintTextColor={theme.mutedForeground}
				tintColor={theme.foreground}
				onChangeText={(event) => {
					setQuery(event.nativeEvent.text);
					setInviteError(false);
				}}
				onCancelButtonPress={() => setQuery("")}
			/>

			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-2"
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{items.map((item, index) => {
					const key = `${item.kind}-${index}`;
					switch (item.kind) {
						case "section":
							return (
								<Text
									key={key}
									className={cn(
										"text-muted-foreground mb-1 text-[15px]",
										index > 0 && "mt-4",
									)}
								>
									{item.section === "invite"
										? t({ message: `Invite to ${organizationName}` })
										: item.section === "teams"
											? t({ message: "Teams" })
											: query
												? t({ message: "People" })
												: t({ message: "Suggested" })}
								</Text>
							);
						case "heading":
							return (
								<Text
									key={key}
									className="text-muted-foreground pt-2 pb-1 text-xs"
								>
									{t({ message: "Keep typing an email to invite" })}
								</Text>
							);
						case "empty":
							return (
								<Text
									key={key}
									className="text-muted-foreground py-2.5 text-xs"
								>
									{t({
										message: `No one in ${organizationName} matches. Type a full email to invite someone new.`,
									})}
								</Text>
							);
						case "blocked":
							return (
								<SuggestionRow
									key={key}
									icon={Lock}
									title={t({ message: `Invite to ${organizationName}` })}
									detail={t({
										message: `Only ${organizationName} admins can invite new people`,
									})}
									disabled
								/>
							);
						case "team":
							return (
								<SuggestionRow
									key={`team:${item.team.teamId}`}
									icon={Users}
									title={item.team.name}
									detail={t({
										message: plural(item.team.memberIds.length, {
											one: "# person",
											other: "# people",
										}),
									})}
									trailing={
										item.hasAccess ? t({ message: "Has access" }) : undefined
									}
									selected={item.hasAccess ? undefined : item.selected}
									accessory={item.selected ? roleMenu(item) : null}
									disabled={item.hasAccess}
									onPress={() => toggle({ kind: "team", team: item.team })}
								/>
							);
						case "member":
							return (
								<SuggestionRow
									key={`user:${item.person.userId}`}
									person={item.person}
									title={item.person.name}
									detail={item.person.email}
									trailing={
										item.hasAccess ? t({ message: "Has access" }) : undefined
									}
									selected={item.hasAccess ? undefined : item.selected}
									accessory={item.selected ? roleMenu(item) : null}
									disabled={item.hasAccess}
									onPress={() => toggle({ kind: "user", person: item.person })}
								/>
							);
						case "invite":
							return (
								<SuggestionRow
									key={`email:${item.email}`}
									icon={UserPlus}
									dashed
									title={item.email}
									detail={t({
										message: `Gets an invite to join ${organizationName}`,
									})}
									trailing={
										item.invited ? t({ message: "Invited" }) : undefined
									}
									selected={item.invited ? undefined : item.selected}
									accessory={item.selected ? roleMenu(item) : null}
									disabled={item.invited}
									onPress={() =>
										inviteNew === "upgrade"
											? onUpgrade()
											: toggle({ kind: "email", email: item.email })
									}
								/>
							);
						case "invalid":
							return (
								<SuggestionRow
									key={key}
									icon={UserPlus}
									dashed
									title={item.text}
									error={
										inviteError
											? t({ message: "Enter a full email address" })
											: undefined
									}
									onPress={() => setInviteError(true)}
								/>
							);
					}
					return null;
				})}
			</ScrollView>
		</>
	);
}
