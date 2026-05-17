import { ProcessObject, ModuleObject, virtualAllocEx, writeBuffer, writeMemory } from 'memoryjs';
import MemoryHelper from './utils/MemoryHelper';
import { IOffsets } from './offsetStore';

export default class GameWriter {
	public shellcodeAddr = -1;
	public initializedWrite = false;
	public writtenPingMessage = true;
	public skipPingMessage = 25;
	public disableWriting = false;

	private amongUs: ProcessObject | null;
	private gameAssembly: ModuleObject | null;
	private memory: MemoryHelper;

	constructor(amongUs: ProcessObject | null, gameAssembly: ModuleObject | null, memory: MemoryHelper) {
		this.amongUs = amongUs;
		this.gameAssembly = gameAssembly;
		this.memory = memory;
	}

	public updateProcess(amongUs: ProcessObject | null, gameAssembly: ModuleObject | null) {
		this.amongUs = amongUs;
		this.gameAssembly = gameAssembly;
	}

	/**
	 * Initializes shellcode that overrides part of the game's network/mod logic
	 * allowing joining custom servers and displaying custom UI elements.
	 */
	public initializeWrites(offsets: IOffsets | undefined, is_linux: boolean, appVersion: string): void {
		if (
			this.memory.getIs64Bit() ||
			!offsets ||
			!this.amongUs ||
			!this.gameAssembly ||
			this.disableWriting ||
			is_linux
		) {
			//not supported atm
			return;
		}

		// Shellcode to join games when u press join..
		const shellCodeAddr = virtualAllocEx(this.amongUs.handle, null, 0x60, 0x00001000 | 0x00002000, 0x40);
		const compareAddr = shellCodeAddr + 0x30;

		const compareAddr1 = (compareAddr & 0xff000000) >> 24;
		const compareAddr2 = (compareAddr & 0x00ff0000) >> 16;
		const compareAddr3 = (compareAddr & 0x0000ff00) >> 8;
		const compareAddr4 = compareAddr & 0x000000ff;

		//(DESTINATION_RVA - CURRENT_RVA (E9) - 5)
		const connectFunc = this.gameAssembly.modBaseAddr + offsets.connectFunc;
		const relativeConnectJMP = connectFunc - (shellCodeAddr + 0x18) - 0x4;

		const fixedUpdateFunc = this.gameAssembly!.modBaseAddr + offsets.fixedUpdateFunc;
		const relativefixedJMP = fixedUpdateFunc + 0x5 - (shellCodeAddr + 0x24) - 0x4;

		const relativeShellJMP = shellCodeAddr - (fixedUpdateFunc + 0x1) - 0x4;

		const shellcode = [
			0x80, // cmp byte ptr [ShellcodeAddr + 0x30], 0x0,
			0x3d,
			compareAddr4, // 0x0
			compareAddr3, // 0x0
			compareAddr2, // 0xA3
			compareAddr1, // 0x0
			0x00,
			0x74, // je 0x13
			0x13,
			0xc6, // mov byte ptr [ShellcodeAddr + 0x30], 0x00
			0x05,
			compareAddr4, // 0x0
			compareAddr3, // 0x0
			compareAddr2, // 0xA3
			compareAddr1, // 0x0
			0x00, // write 0x0
			0xc7, // mov [ebp - 0x4], 0x1
			0x45,
			0xfc,
			0x01,
			0x00,
			0x00,
			0x00,
			0xe9, // jmp innerNet.InnerNetClient.Connect
			relativeConnectJMP & 0x000000ff,
			(relativeConnectJMP & 0x0000ff00) >> 8,
			(relativeConnectJMP & 0x00ff0000) >> 16,
			(relativeConnectJMP & 0xff000000) >> 24,
			0x55, // original 5 bytes && (je 0x13 endpoint)
			0x8b,
			0xec,
			0x56,
			0x8b,
			0x75,
			0x08,
			0xe9, // jmp innerNet.InnerNetClient.FixedUpdate + 0x5
			relativefixedJMP & 0x000000ff,
			(relativefixedJMP & 0x0000ff00) >> 8,
			(relativefixedJMP & 0x00ff0000) >> 16,
			(relativefixedJMP & 0xff000000) >> 24,
		];

		const shellcodeJMP = [
			// jmp ShellcodeRelativeAddress
			0xe9,
			relativeShellJMP & 0x000000ff,
			(relativeShellJMP & 0x0000ff00) >> 8,
			(relativeShellJMP & 0x00ff0000) >> 16,
			(relativeShellJMP & 0xff000000) >> 24,
		];

		const modManagerLateUpdate = this.gameAssembly!.modBaseAddr + offsets.modLateUpdateFunc;
		const shellCodeAddr_1 = shellCodeAddr + 0x300;
		const relativeShellJMP_1 = shellCodeAddr_1 - (modManagerLateUpdate + 0x1) - 0x4;
		const relativefixedJMP_1 = modManagerLateUpdate + 0x5 - (shellCodeAddr_1 + 0x1c) - 0x4;
		const showModStampFunc = this.gameAssembly!.modBaseAddr + offsets.showModStampFunc;
		const relativeShowModStamp = showModStampFunc + 0x6 - (shellCodeAddr_1 + 0x12) - 0x4;

		const _compareAddr = shellCodeAddr + 0x44;

		const _compareAddr1 = (_compareAddr & 0xff000000) >> 24;
		const _compareAddr2 = (_compareAddr & 0x00ff0000) >> 16;
		const _compareAddr3 = (_compareAddr & 0x0000ff00) >> 8;
		const _compareAddr4 = _compareAddr & 0x000000ff;

		const shellcode_modIcon = [
			0x80, // cmp byte ptr [ShellcodeAddr + 0x30], 0x0,
			0x3d,
			_compareAddr4, // 0x0
			_compareAddr3, // 0x0
			_compareAddr2, // 0xA3
			_compareAddr1, // 0x0
			0x00,
			0x74, // je 0x13
			0x0c,
			0xc6, // mov byte ptr [ShellcodeAddr + 0x30], 0x00
			0x05,
			_compareAddr4, // 0x0
			_compareAddr3, // 0x0
			_compareAddr2, // 0xA3
			_compareAddr1, // 0x0
			0x00, // write 0x0
			0xe9,
			relativeShowModStamp & 0x000000ff,
			(relativeShowModStamp & 0x0000ff00) >> 8,
			(relativeShowModStamp & 0x00ff0000) >> 16,
			(relativeShowModStamp & 0xff000000) >> 24,
			0x53,
			0x8b,
			0xdc,
			0x83,
			0xec,
			0x08,
			0xe9, // jmp innerNet.InnerNetClient.FixedUpdate + 0x5
			relativefixedJMP_1 & 0x000000ff,
			(relativefixedJMP_1 & 0x0000ff00) >> 8,
			(relativefixedJMP_1 & 0x00ff0000) >> 16,
			(relativefixedJMP_1 & 0xff000000) >> 24,
		];

		const shellcodeJMP_1 = [
			// jmp ShellcodeRelativeAddress
			0xe9,
			relativeShellJMP_1 & 0x000000ff,
			(relativeShellJMP_1 & 0x0000ff00) >> 8,
			(relativeShellJMP_1 & 0x00ff0000) >> 16,
			(relativeShellJMP_1 & 0xff000000) >> 24,
			0x90,
		];

		//MMOnline
		this.writeString(shellCodeAddr + 0x70, 'OnlineGame', offsets);
		this.writeString(shellCodeAddr + 0x95, 'MMOnline', offsets);

		this.writeString(
			shellCodeAddr + 0xd5,
			`<size=85%><color=#BA68C8>BetterCrewLink v${appVersion}</color></size>\n<size=60%><color=#BA68C8>https://bettercrewlink.app</color></size><size=85%>\nPing: {0}ms</size>`,
			offsets
		);

		writeBuffer(this.amongUs!.handle, shellCodeAddr, Buffer.from(shellcode));
		writeBuffer(this.amongUs!.handle, fixedUpdateFunc, Buffer.from(shellcodeJMP));

		writeBuffer(this.amongUs!.handle, shellCodeAddr_1, Buffer.from(shellcode_modIcon));
		writeBuffer(this.amongUs!.handle, modManagerLateUpdate, Buffer.from(shellcodeJMP_1));

		this.shellcodeAddr = shellCodeAddr;
		this.writtenPingMessage = false;
		this.initializedWrite = true;
	}

	/**
	 * Writes a string literal to the specified memory address by allocating string bytes
	 * in the expected memory layout.
	 */
	public writeString(address: number, text: string, offsets: IOffsets): void {
		if (!this.gameAssembly || !this.amongUs) return;
		const innerNetClient = this.memory.readMemory<number>(
			'ptr',
			this.gameAssembly.modBaseAddr,
			offsets.innerNetClient.base
		);
		const stringBase = this.memory.readMemory<number>('int', innerNetClient, [0x80, 0x0]); // mainMenuScene just a random string where we can base our string off

		const connectionString = [
			stringBase & 0x000000ff,
			(stringBase & 0x0000ff00) >> 8,
			(stringBase & 0x00ff0000) >> 16,
			(stringBase & 0xff000000) >> 24,
			0x00,
			0x00,
			0x00,
			0x00,
			text.length, // length
			0x00,
			0x00,
			0x00,
		];
		for (let index = 0; index < text.length; index++) {
			connectionString.push(text.charCodeAt(index));
			connectionString.push(0x0);
		}
		writeBuffer(this.amongUs.handle, address, Buffer.from(connectionString));
	}

	/**
	 * Fixes the UI ping text element to display the custom mod message dynamically.
	 */
	public fixPingMessage(offsets: IOffsets | undefined) {
		if (
			!offsets ||
			!this.gameAssembly ||
			!this.amongUs ||
			!this.initializedWrite ||
			this.writtenPingMessage ||
			this.skipPingMessage-- > 0
		) {
			return;
		}
		writeMemory(this.amongUs.handle, this.shellcodeAddr + 0x44, 1, 'int32'); // enable ModIcon

		this.skipPingMessage = 25;
		this.writtenPingMessage = true;
		for (let index = 0; index < 3; index++) {
			const stringOffset = this.memory.findPattern(
				offsets.signatures.pingMessageString.sig,
				offsets.signatures.pingMessageString.patternOffset,
				offsets.signatures.pingMessageString.addressOffset,
				false,
				false,
				index
			);
			const stringPtr = this.memory.readMemory<number>('int', this.gameAssembly.modBaseAddr, stringOffset);
			const pingstring = this.memory.readString(stringPtr);
			if (pingstring.includes('Ping') || pingstring.includes('<color=#BA68C8')) {
				writeMemory(
					this.amongUs.handle,
					this.gameAssembly.modBaseAddr + stringOffset,
					this.shellcodeAddr + 0xd5,
					'int32'
				);
				break;
			}
		}
	}

	public joinGame(code: string, server: string, offsets: IOffsets | undefined): boolean {
		return false;
		// Logic currently disabled in base
	}
}
