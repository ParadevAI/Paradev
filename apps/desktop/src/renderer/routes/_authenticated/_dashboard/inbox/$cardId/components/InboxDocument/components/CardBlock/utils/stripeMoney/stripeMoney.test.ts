import { describe, expect, test } from "bun:test";
import {
	currencyDigits,
	moneyInputText,
	parseMoneyInput,
	stripeMoney,
	stripeMoneyWithCode,
} from "./stripeMoney";

describe("stripeMoney", () => {
	test("a two-decimal currency", () => {
		expect(stripeMoney(2000, "usd")).toBe("$20.00");
		expect(stripeMoney(123456, "usd")).toBe("$1,234.56");
		expect(stripeMoney(1342, "eur")).toBe("€13.42");
	});

	test("a zero-decimal currency", () => {
		expect(currencyDigits("jpy")).toBe(0);
		expect(stripeMoney(4900, "jpy")).toBe("¥4,900");
	});

	test("a three-decimal currency", () => {
		expect(stripeMoney(1500, "kwd")).toMatch(/^KWD\s1\.500$/);
	});

	test("negative and zero", () => {
		expect(stripeMoney(-500, "usd")).toBe("-$5.00");
		expect(stripeMoney(0, "usd")).toBe("$0.00");
		expect(stripeMoney(0, "jpy")).toBe("¥0");
	});
});

describe("stripeMoneyWithCode", () => {
	test("the currency code follows the amount", () => {
		expect(stripeMoneyWithCode(2000, "usd")).toBe("$20.00 USD");
		expect(stripeMoneyWithCode(4900, "jpy")).toBe("¥4,900 JPY");
	});
});

describe("moneyInputText", () => {
	test("the amount in the main unit, with the currency's decimals", () => {
		expect(moneyInputText(2500, "usd")).toBe("25.00");
		expect(moneyInputText(5, "usd")).toBe("0.05");
		expect(moneyInputText(4900, "jpy")).toBe("4900");
	});
});

describe("parseMoneyInput", () => {
	test("reads an amount back into the smallest unit", () => {
		expect(parseMoneyInput("25", "usd")).toBe(2500);
		expect(parseMoneyInput("25.5", "usd")).toBe(2550);
		expect(parseMoneyInput(" 19.99 ", "usd")).toBe(1999);
		expect(parseMoneyInput("0", "usd")).toBe(0);
		expect(parseMoneyInput("4900", "jpy")).toBe(4900);
	});

	test("rejects more decimals than the currency has", () => {
		expect(parseMoneyInput("25.001", "usd")).toBeNull();
		expect(parseMoneyInput("49.5", "jpy")).toBeNull();
	});

	test("rejects what is not a plain amount", () => {
		for (const text of ["", "abc", "-5", "1,000", "$5", "5.", ".5", "1e3"])
			expect(parseMoneyInput(text, "usd")).toBeNull();
	});
});
