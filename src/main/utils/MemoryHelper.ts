import {
	DataType,
	ModuleObject,
	ProcessObject,
	readBuffer,
	readMemory as readMemoryRaw,
	findPattern as findPatternRaw,
} from 'memoryjs';

/**
 * Helper class that encapsulates memory reading logic for memoryjs.
 * This class abstracts away raw memoryjs functions.
 */
export default class MemoryHelper {
	private amongUs: ProcessObject | null;
	private gameAssembly: ModuleObject | null;
	private is_64bit: boolean;

	constructor(amongUs: ProcessObject | null, gameAssembly: ModuleObject | null, is_64bit: boolean) {
		this.amongUs = amongUs;
		this.gameAssembly = gameAssembly;
		this.is_64bit = is_64bit;
	}

	public updateProcess(amongUs: ProcessObject | null, gameAssembly: ModuleObject | null, is_64bit: boolean) {
		this.amongUs = amongUs;
		this.gameAssembly = gameAssembly;
		this.is_64bit = is_64bit;
	}

	public getIs64Bit(): boolean {
		return this.is_64bit;
	}

	public setIs64Bit(is64bit: boolean) {
		this.is_64bit = is64bit;
	}

	public checkIsX64Version(): boolean {
		if (!this.amongUs || !this.gameAssembly) return false;

		const optionalHeader_offset = readMemoryRaw<number>(
			this.amongUs.handle,
			this.gameAssembly.modBaseAddr + 0x3c,
			'uint32'
		);
		const optionalHeader_magic = readMemoryRaw<number>(
			this.amongUs.handle,
			this.gameAssembly.modBaseAddr + optionalHeader_offset + 0x18,
			'short'
		);
		return optionalHeader_magic === 0x20b;
	}

	public readMemory<T>(dataType: DataType, address: number, offsets?: number[] | number, defaultParam?: T): T {
		if (!this.amongUs) return defaultParam as T;
		if (address === 0) return defaultParam as T;

		let normalizedDataType = dataType;
		if (dataType === 'pointer' || dataType === 'ptr') {
			normalizedDataType = this.is_64bit ? 'uint64' : 'uint32';
		}

		let offsetArray = offsets;
		if (typeof offsets === 'number') {
			offsetArray = [offsets];
		}

		const { address: addr, last } = this.offsetAddress(address, (offsetArray as number[]) || []);
		if (addr === 0) return defaultParam as T;
		return readMemoryRaw<T>(this.amongUs.handle, addr + last, normalizedDataType);
	}

	public offsetAddress(address: number, offsets: number[]): { address: number; last: number } {
		if (!this.amongUs) throw 'Among Us not open? Weird error';
		let currentAddress = this.is_64bit ? address : address; // Just keep as is, maintaining original logic
		for (let i = 0; i < offsets.length - 1; i++) {
			currentAddress = readMemoryRaw<number>(
				this.amongUs.handle,
				currentAddress + offsets[i],
				this.is_64bit ? 'uint64' : 'uint32'
			);

			if (currentAddress == 0) break;
		}
		const last = offsets.length > 0 ? offsets[offsets.length - 1] : 0;
		return { address: currentAddress, last };
	}

	public readString(address: number, maxLength = 50): string {
		try {
			if (address === 0 || !this.amongUs) {
				return '';
			}
			const length = Math.max(
				0,
				Math.min(readMemoryRaw<number>(this.amongUs.handle, address + (this.is_64bit ? 0x10 : 0x8), 'int'), maxLength)
			);
			const buffer = readBuffer(this.amongUs.handle, address + (this.is_64bit ? 0x14 : 0xc), length << 1);
			if (buffer) {
				return buffer.toString('utf16le').replace(/\0/g, '');
			} else {
				return '';
			}
		} catch (e) {
			return '';
		}
	}

	public readDictionary(
		address: number,
		maxLen: number,
		callback: (keyPtr: number, valPtr: number, index: number) => void
	): void {
		const entries = this.readMemory<number>('ptr', address + (this.is_64bit ? 0x18 : 0xc));
		let len = this.readMemory<number>('uint32', address + (this.is_64bit ? 0x20 : 0x10));

		len = len > maxLen ? maxLen : len;

		for (let i = 0; i < len; i++) {
			const offset = entries + ((this.is_64bit ? 0x20 : 0x10) + i * (this.is_64bit ? 0x18 : 0x10));
			callback(offset, offset + (this.is_64bit ? 0x10 : 0xc), i);
		}
	}

	public findPattern(
		signature: string,
		patternOffset = 0x1,
		addressOffset = 0x0,
		relative = false,
		getLocation = false,
		skip = 0
	): number {
		if (!this.amongUs || !this.gameAssembly) return 0x0;
		const signatureTypes = 0x0 | 0x2;
		const instruction_location = findPatternRaw(
			this.amongUs.handle,
			'GameAssembly.dll',
			signature,
			signatureTypes,
			patternOffset,
			0x0,
			skip
		);
		if (getLocation) {
			return instruction_location + addressOffset;
		}
		const offsetAddr = this.readMemory<number>('int', this.gameAssembly.modBaseAddr, [instruction_location]);

		return this.is_64bit || relative
			? offsetAddr + instruction_location + addressOffset
			: offsetAddr - this.gameAssembly.modBaseAddr;
	}
}
