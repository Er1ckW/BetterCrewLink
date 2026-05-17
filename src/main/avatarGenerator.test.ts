import { numberToColorHex } from './avatarGenerator';

describe('numberToColorHex', () => {
	it('should correctly format basic colors', () => {
		// White - 0xffffff in BGR (or RGB since all are F)
		expect(numberToColorHex(0xffffff)).toBe('#ffffff');

		// Black - 0x000000
		expect(numberToColorHex(0x000000)).toBe('#000000');
	});

	it('should correctly handle byte reversal from BGR to RGB hex string', () => {
		// The game often provides colors in BGR format depending on context,
		// and numberToColorHex takes the input, pads it, and reverses the bytes.

		// Example: 0x123456 -> padded to '123456' -> regex split to ['12', '34', '56'] -> reversed ['56', '34', '12'] -> '#563412'
		expect(numberToColorHex(0x123456)).toBe('#563412');

		// Example: 0xaa00cc -> '#cc00aa'
		expect(numberToColorHex(0xaa00cc)).toBe('#cc00aa');
	});

	it('should correctly pad numbers that are smaller than 6 hex digits', () => {
		// Example: 0xff -> '0000ff' -> reversed ['ff', '00', '00'] -> '#ff0000'
		expect(numberToColorHex(0xff)).toBe('#ff0000');

		// Example: 0x1234 -> '001234' -> reversed ['34', '12', '00'] -> '#341200'
		expect(numberToColorHex(0x1234)).toBe('#341200');
	});

	it('should ignore bits beyond the first 24 bits (mask 0x00ffffff)', () => {
		// The function applies a mask: (colour & 0x00ffffff)

		// Example: 0xff123456 -> masked to 0x123456 -> reversed -> '#563412'
		expect(numberToColorHex(0xff123456)).toBe('#563412');

		// Example: 0xaa000000 -> masked to 0x000000 -> reversed -> '#000000'
		expect(numberToColorHex(0xaa000000)).toBe('#000000');
	});
});
