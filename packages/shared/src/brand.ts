const NAME = "Superset";
const FORMER_NAME = "Superset";

function introName(name: string, formerName: string): string {
	return name === formerName ? name : `${name} (formerly ${formerName})`;
}

export const BRAND = {
	NAME,
	FORMER_NAME,
	INTRO_NAME: introName(NAME, FORMER_NAME),
} as const;
