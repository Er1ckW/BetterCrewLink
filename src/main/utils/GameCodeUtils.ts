/**
 * Utilities for converting between an Among Us integer game code
 * and the string representation (and vice versa).
 */

/**
 * Converts a game code integer to its string representation.
 * Handles both older V1 4-letter codes and newer V2 6-letter codes.
 *
 * @param input The integer representation of the game code.
 * @returns The string representation of the game code.
 */
export function IntToGameCode(input: number): string {
	if (!input || input === 0) return '';
	else if (input <= -1000) return IntToGameCodeV2Impl(input);
	else if (input > 0) return IntToGameCodeV1Impl(input);
	else return '';
}

/**
 * Converts a V1 game code integer to its 4-letter string representation.
 *
 * @param input The integer representation of the game code.
 * @returns The 4-letter string game code.
 */
export function IntToGameCodeV1Impl(input: number): string {
	const buf = Buffer.alloc(4);
	buf.writeInt32LE(input, 0);
	return buf.toString();
}

/**
 * Converts a V2 game code integer to its 6-letter string representation.
 *
 * @param input The integer representation of the game code.
 * @returns The 6-letter string game code.
 */
export function IntToGameCodeV2Impl(input: number): string {
	const V2 = 'QWXRTYLPESDFGHUJKZOCVBINMA';
	const a = input & 0x3ff;
	const b = (input >> 10) & 0xfffff;
	return [
		V2[Math.floor(a % 26)],
		V2[Math.floor(a / 26)],
		V2[Math.floor(b % 26)],
		V2[Math.floor((b / 26) % 26)],
		V2[Math.floor((b / 676) % 26)],
		V2[Math.floor((b / 17576) % 26)],
	].join('');
}

/**
 * Converts a string game code to its integer representation.
 * Determines version based on string length.
 *
 * @param code The string game code.
 * @returns The integer representation of the game code.
 */
export function gameCodeToInt(code: string): number {
	return code.length === 4 ? gameCodeToIntV1Impl(code) : gameCodeToIntV2Impl(code);
}

/**
 * Converts a V1 4-letter string game code to its integer representation.
 *
 * @param code The 4-letter string game code.
 * @returns The integer representation of the game code.
 */
export function gameCodeToIntV1Impl(code: string): number {
	const buf = Buffer.alloc(4);
	buf.write(code);
	return buf.readInt32LE(0);
}

/**
 * Converts a V2 6-letter string game code to its integer representation.
 *
 * @param code The 6-letter string game code.
 * @returns The integer representation of the game code.
 */
export function gameCodeToIntV2Impl(code: string): number {
	const V2Map = [25, 21, 19, 10, 8, 11, 12, 13, 22, 15, 16, 6, 24, 23, 18, 7, 0, 3, 9, 4, 14, 20, 1, 2, 5, 17];
	const a = V2Map[code.charCodeAt(0) - 65];
	const b = V2Map[code.charCodeAt(1) - 65];
	const c = V2Map[code.charCodeAt(2) - 65];
	const d = V2Map[code.charCodeAt(3) - 65];
	const e = V2Map[code.charCodeAt(4) - 65];
	const f = V2Map[code.charCodeAt(5) - 65];
	const one = (a + 26 * b) & 0x3ff;
	const two = c + 26 * (d + 26 * (e + 26 * f));
	return one | ((two << 10) & 0x3ffffc00) | 0x80000000;
}

/**
 * Generates a simple hash code for a given string.
 * Used for hashing player names.
 *
 * @param s The string to hash.
 * @returns The hash code as an integer.
 */
export function hashCode(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	return h;
}
