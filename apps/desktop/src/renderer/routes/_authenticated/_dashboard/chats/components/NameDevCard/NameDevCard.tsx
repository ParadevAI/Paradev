import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import {
	FACES,
	FaceAvatar,
} from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

/** The first step in chats: name the Dev that is yours. */
export function NameDevCard({
	onCreate,
}: {
	onCreate: (name: string) => Promise<unknown>;
}) {
	const { t } = useLingui();
	const [name, setName] = useState("");
	const [isCreating, setCreating] = useState(false);
	const face = FACES[0];
	return (
		<form
			className="flex w-80 flex-col items-center gap-3 text-center"
			onSubmit={(event) => {
				event.preventDefault();
				if (!name.trim() || isCreating) return;
				setCreating(true);
				void onCreate(name.trim()).finally(() => setCreating(false));
			}}
		>
			{face && <FaceAvatar face={face} size={60} />}
			<h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">
				<Trans>Name your Dev</Trans>
			</h2>
			<p className="text-sm text-muted-foreground">
				<Trans>
					It is yours alone. Talk to it here, and add it to groups when you want
					its help there.
				</Trans>
			</p>
			<Input
				autoFocus
				value={name}
				maxLength={60}
				placeholder={t({ message: "Name" })}
				onChange={(event) => setName(event.target.value)}
			/>
			<Button
				type="submit"
				className="w-full"
				disabled={!name.trim() || isCreating}
			>
				<Trans>Continue</Trans>
			</Button>
		</form>
	);
}
