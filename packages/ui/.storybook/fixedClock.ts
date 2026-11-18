/** Stories run on a fixed clock, so captures do not change from day to day. Same instant as the fixtures' `STORY_NOW`. */
const NOW = Date.parse("2026-11-18T14:00:00Z");
const RealDate = Date;

class FixedDate extends RealDate {
	constructor(...args: ConstructorParameters<typeof Date> | []) {
		if (args.length === 0) super(NOW);
		else super(...(args as ConstructorParameters<typeof Date>));
	}

	static now() {
		return NOW;
	}
}

globalThis.Date = FixedDate as DateConstructor;
