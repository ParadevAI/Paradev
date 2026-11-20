const pad = (n: number) => String(n).padStart(2, "0");

export const toDate = (day: string) => {
	const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
	return new Date(y, m - 1, d);
};

export const toDay = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
