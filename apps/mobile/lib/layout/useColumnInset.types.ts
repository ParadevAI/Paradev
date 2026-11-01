/**
 * Side padding that keeps a full-width screen's chrome (chat, composer
 * strip) in the readable column where the screen has one, and `base`
 * where it does not.
 */
export type UseColumnInset = (base: number) => number;
