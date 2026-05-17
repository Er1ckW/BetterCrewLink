import {
	findModule,
	getProcesses,
	ModuleObject,
	openProcess,
	ProcessObject,
	readBuffer,
	getProcessPath,
} from 'memoryjs';
import Struct from 'structron';
import { IpcOverlayMessages, IpcRendererMessages } from '../common/ipc-messages';
import { GameState, AmongUsState, Player } from '../common/AmongUsState';
import { fetchOffsetLookup, fetchOffsets, IOffsets, IOffsetsLookup } from './offsetStore';
import Errors from '../common/Errors';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { GenerateAvatars, numberToColorHex } from './avatarGenerator';
import { RainbowColorId } from '../renderer/cosmetics';
import { platform } from 'os';
import fs from 'fs';
import path from 'path';
import { AmongusMod, modList } from '../common/Mods';
import { app } from 'electron';
import { IntToGameCode, hashCode } from './utils/GameCodeUtils';
import MemoryHelper from './utils/MemoryHelper';
import GameWriter from './GameWriter';

let appVersion = '';
if (process.env.NODE_ENV !== 'production') {
	appVersion = 'DEV';
} else {
	appVersion = app.getVersion();
}

interface ValueType<T> {
	read(buffer: BufferSource, offset: number): T;
	SIZE: number;
}

interface PlayerReport {
	objectPtr: number;
	outfitsPtr: number;
	id: number;
	name: number;
	color: number;
	hat: string;
	skin: string;
	visor: string;
	pet: number;
	rolePtr: number;
	disconnected: number;
	impostor: number;
	dead: number;
	taskPtr: number;
}

export default class GameReader {
	sendIPC: Electron.WebContents['send'];
	offsets: IOffsets | undefined;
	PlayerStruct: Struct | undefined;
	menuUpdateTimer = 20;
	lastPlayerPtr = 0;
	shouldReadLobby = false;
	is_64bit = false;
	is_linux = false;
	oldGameState = GameState.UNKNOWN;
	lastState: AmongUsState = {} as AmongUsState;
	amongUs: ProcessObject | null = null;
	memory: MemoryHelper;
	writer: GameWriter;
	gameAssembly: ModuleObject | null = null;
	colorsInitialized = false;
	rainbowColor = -9999;
	gameCode = 'MENU';
	currentServer = '';
	pid = -1;
	loadedMod = modList[0];
	gamePath = '';
	oldMeetingHud = false;
	playercolors: string[][] = [];

	constructor(sendIPC: Electron.WebContents['send']) {
		this.is_linux = platform() === 'linux';
		this.sendIPC = sendIPC;
		this.memory = new MemoryHelper(null, null, false);
		this.writer = new GameWriter(null, null, this.memory);
	}

	async checkProcessOpen(): Promise<void> {
		const processesOpen = getProcesses().filter((p) => p.szExeFile === 'Among Us.exe');
		let error = '';
		const reset = this.amongUs && processesOpen.filter((o) => o.th32ProcessID === this.pid).length === 0;
		if ((!this.amongUs || reset) && processesOpen.length > 0) {
			for (const processOpen of processesOpen) {
				try {
					this.pid = processOpen.th32ProcessID;
					this.amongUs = openProcess(processOpen.th32ProcessID);
					this.gameAssembly = findModule('GameAssembly.dll', this.amongUs.th32ProcessID);
					this.gamePath = getProcessPath(this.amongUs.handle);
					this.loadedMod = this.getInstalledMods(this.gamePath);
					this.memory.updateProcess(this.amongUs, this.gameAssembly, this.is_64bit);
					this.writer.updateProcess(this.amongUs, this.gameAssembly);
					await this.initializeoffsets();
					this.sendIPC(IpcRendererMessages.NOTIFY_GAME_OPENED, true);
					break;
				} catch (e) {
					console.log('ERROR:', e);
					if (processOpen && String(e) === 'Error: unable to find process') {
						error = Errors.OPEN_AS_ADMINISTRATOR;
					} else {
						error = String(e);
					}
					this.amongUs = null;
				}
			}
			if (!this.amongUs && error) {
				throw error;
			}
		} else if (this.amongUs && (processesOpen.length === 0 || reset)) {
			this.amongUs = null;
			this.memory.updateProcess(null, null, false);
			this.writer.updateProcess(null, null);
			try {
				this.sendIPC(IpcRendererMessages.NOTIFY_GAME_OPENED, false);
			} catch (e) {
				/*empty*/
			}
		}
		return;
	}

	getInstalledMods(filePath: string): AmongusMod {
		const pathLower = filePath.toLowerCase();
		if (pathLower.includes('?\\volume')) {
			return modList[0];
		} else {
			const dir = path.dirname(filePath);
			if (!fs.existsSync(path.join(dir, 'winhttp.dll')) || !fs.existsSync(path.join(dir, 'BepInEx', 'plugins'))) {
				return modList[0];
			}
			for (const file of fs.readdirSync(path.join(dir, 'BepInEx', 'plugins'))) {
				console.log(`MOD! ${file}`);
				const mod = modList.find((o) => o.dllStartsWith && file.includes(o.dllStartsWith));
				if (mod) return mod;
			}
			return modList[0];
		}
	}

	checkProcessDelay = 0;
	isLocalGame = false;
	async loop(): Promise<string | null> {
		if (this.checkProcessDelay-- <= 0) {
			this.checkProcessDelay = 30;
			try {
				await this.checkProcessOpen();
			} catch (e) {
				this.checkProcessDelay = 0;
				return String(e);
			}
		}
		if (
			this.PlayerStruct &&
			this.offsets &&
			this.amongUs !== null &&
			this.gameAssembly !== null &&
			this.offsets !== undefined
		) {
			this.loadColors();

			let state = GameState.UNKNOWN;
			const meetingHud = this.memory.readMemory<number>(
				'pointer',
				this.gameAssembly.modBaseAddr,
				this.offsets.meetingHud
			);
			const meetingHud_cachePtr =
				meetingHud === 0 ? 0 : this.memory.readMemory<number>('pointer', meetingHud, this.offsets.objectCachePtr);
			const meetingHudState =
				meetingHud_cachePtr === 0 ? 4 : this.memory.readMemory('int', meetingHud, this.offsets.meetingHudState, 4);

			const innerNetClient = this.memory.readMemory<number>(
				'ptr',
				this.gameAssembly.modBaseAddr,
				this.offsets.innerNetClient.base
			);

			const gameState = this.memory.readMemory<number>('int', innerNetClient, this.offsets.innerNetClient.gameState);

			switch (gameState) {
				case 0:
					state = GameState.MENU;
					break;
				case 1:
				case 3:
					state = GameState.LOBBY;
					break;
				default:
					if (meetingHudState < 4) state = GameState.DISCUSSION;
					else state = GameState.TASKS;
					break;
			}
			// const DEBUG = true;
			const lobbyCodeInt =
				state === GameState.MENU
					? -1
					: this.memory.readMemory<number>('int32', innerNetClient, this.offsets.innerNetClient.gameId);

			this.gameCode =
				state === GameState.MENU
					? ''
					: lobbyCodeInt === this.lastState.lobbyCodeInt
					? this.gameCode
					: IntToGameCode(lobbyCodeInt);

			// if (DEBUG) {
			// 	this.gameCode = 'oof';
			// }

			const allPlayersPtr = this.memory.readMemory<number>(
				'ptr',
				this.gameAssembly.modBaseAddr,
				this.offsets.allPlayersPtr
			);
			const allPlayers = this.memory.readMemory<number>('ptr', allPlayersPtr, this.offsets.allPlayers);

			const playerCount = this.memory.readMemory<number>('int' as const, allPlayersPtr, this.offsets.playerCount);
			let playerAddrPtr = allPlayers + this.offsets.playerAddrPtr;
			const players = [];

			const hostId = this.memory.readMemory<number>('uint32', innerNetClient, this.offsets.innerNetClient.hostId);
			const clientId = this.memory.readMemory<number>('uint32', innerNetClient, this.offsets.innerNetClient.clientId);
			this.isLocalGame = lobbyCodeInt === 32; // is local game
			let lightRadius = 1;
			let comsSabotaged = false;
			let currentCamera = CameraLocation.NONE;
			let map = MapType.UNKNOWN;
			let maxPlayers = 10;
			const closedDoors: number[] = [];
			let localPlayer = undefined;
			if (
				this.currentServer === '' ||
				(this.oldGameState != state &&
					(this.oldGameState === GameState.MENU || this.oldGameState === GameState.UNKNOWN))
			) {
				this.readCurrentServer();
			}
			if ((this.gameCode || this.isLocalGame) && playerCount) {
				for (let i = 0; i < Math.min(playerCount, 40); i++) {
					const { address, last } = this.memory.offsetAddress(playerAddrPtr, this.offsets.player.offsets);
					if (address === 0) continue;
					const playerData = readBuffer(this.amongUs.handle, address + last, this.offsets.player.bufferLength);
					const player = this.parsePlayer(address + last, playerData, clientId);
					playerAddrPtr += this.is_64bit ? 8 : 4;
					if (!player || state === GameState.MENU) {
						continue;
					}

					if (this.isLocalGame && player.clientId == hostId) {
						this.gameCode = (player.nameHash % 99999).toString();
					}
					if (player.isLocal) {
						localPlayer = player;
					}

					players.push(player);
				}
				if (localPlayer) {
					this.writer.fixPingMessage(this.offsets);
					lightRadius = this.memory.readMemory<number>('float', localPlayer.objectPtr, this.offsets.lightRadius, -1);
				}
				const gameOptionsPtr = this.memory.readMemory<number>(
					'ptr',
					this.gameAssembly.modBaseAddr,
					this.offsets.gameoptionsData
				);
				maxPlayers = this.memory.readMemory<number>('byte', gameOptionsPtr, this.offsets.gameOptions_MaxPLayers);
				map = this.memory.readMemory<number>('byte', gameOptionsPtr, this.offsets.gameOptions_MapId);
				if (state === GameState.TASKS) {
					const shipPtr = this.memory.readMemory<number>('ptr', this.gameAssembly.modBaseAddr, this.offsets.shipStatus);

					const systemsPtr = this.memory.readMemory<number>('ptr', shipPtr, this.offsets.shipStatus_systems);

					if (systemsPtr !== 0 && state === GameState.TASKS) {
						this.memory.readDictionary(systemsPtr, 47, (k, v) => {
							const key = this.memory.readMemory<number>('int32', k);
							if (key === 14) {
								const value = this.memory.readMemory<number>('ptr', v);
								switch (map) {
									case MapType.AIRSHIP:
									case MapType.POLUS:
									case MapType.FUNGLE:
									case MapType.THE_SKELD:
									case MapType.SUBMERGED: {
										comsSabotaged =
											this.memory.readMemory<number>('uint32', value, this.offsets!.HudOverrideSystemType_isActive) ===
											1;
										break;
									}
									case MapType.MIRA_HQ: {
										comsSabotaged =
											this.memory.readMemory<number>('uint32', value, this.offsets!.hqHudSystemType_CompletedConsoles) <
											2;
									}
								}
							} else if (key === 18 && map === MapType.MIRA_HQ) {
								//SystemTypes Decontamination
								const value = this.memory.readMemory<number>('ptr', v);
								const lowerDoorOpen = this.memory.readMemory<number>('int', value, this.offsets!.deconDoorLowerOpen);
								const upperDoorOpen = this.memory.readMemory<number>('int', value, this.offsets!.deconDoorUpperOpen);
								if (!lowerDoorOpen) {
									closedDoors.push(0);
								}
								if (!upperDoorOpen) {
									closedDoors.push(1);
								}
							}
						});
					}

					const minigamePtr = this.memory.readMemory<number>(
						'ptr',
						this.gameAssembly.modBaseAddr,
						this.offsets!.miniGame
					);
					const minigameCachePtr = this.memory.readMemory<number>('ptr', minigamePtr, this.offsets!.objectCachePtr);
					if (minigameCachePtr && minigameCachePtr !== 0 && localPlayer) {
						if (map === MapType.POLUS || map === MapType.AIRSHIP) {
							const currentCameraId = this.memory.readMemory<number>(
								'uint32',
								minigamePtr,
								this.offsets!.planetSurveillanceMinigame_currentCamera
							);
							const camarasCount = this.memory.readMemory<number>(
								'uint32',
								minigamePtr,
								this.offsets!.planetSurveillanceMinigame_camarasCount
							);

							if (currentCameraId >= 0 && currentCameraId <= 5 && camarasCount === 6) {
								currentCamera = currentCameraId as CameraLocation;
							}
						} else if (map === MapType.THE_SKELD) {
							const roomCount = this.memory.readMemory<number>(
								'uint32',
								minigamePtr,
								this.offsets!.surveillanceMinigame_FilteredRoomsCount
							);
							if (roomCount === 4) {
								const dist = Math.sqrt(Math.pow(localPlayer.x - -12.9364, 2) + Math.pow(localPlayer.y - -2.7928, 2));
								if (dist < 0.6) {
									currentCamera = CameraLocation.Skeld;
								}
							}
						}
					}
					if (map !== MapType.MIRA_HQ) {
						const allDoors = this.memory.readMemory<number>('ptr', shipPtr, this.offsets.shipstatus_allDoors);
						const doorCount = Math.min(this.memory.readMemory<number>('int', allDoors, this.offsets.playerCount), 16);
						for (let doorNr = 0; doorNr < doorCount; doorNr++) {
							const door = this.memory.readMemory<number>(
								'ptr',
								allDoors + this.offsets.playerAddrPtr + doorNr * (this.is_64bit ? 0x8 : 0x4)
							);
							const doorOpen = this.memory.readMemory<number>('int', door + this.offsets.door_isOpen) === 1;
							//	const doorId = this.memory.readMemory<number>('int', door + this.offsets.door_doorId);
							//console.log(doorId);
							if (!doorOpen) {
								closedDoors.push(doorNr);
							}
						}
					}
				}
				//	console.log('doorcount: ', doorCount, doorsOpen);
			}

			// if (this.oldGameState === GameState.DISCUSSION && state === GameState.TASKS) {
			// 	if (impostors === 0 || impostors >= crewmates) {
			// 		this.exileCausesEnd = true;
			// 		state = GameState.LOBBY;
			// 	}
			// }

			if (
				this.oldGameState === GameState.MENU &&
				state === GameState.LOBBY &&
				this.menuUpdateTimer > 0 &&
				(this.lastPlayerPtr === allPlayers || !players.find((p) => p.isLocal))
			) {
				state = GameState.MENU;
				this.menuUpdateTimer--;
			} else {
				this.menuUpdateTimer = 20;
				this.lastPlayerPtr = allPlayers;
			}
			const lobbyCode = state !== GameState.MENU ? this.gameCode || 'MENU' : 'MENU';
			const newState: AmongUsState = {
				lobbyCode: lobbyCode,
				lobbyCodeInt,
				players,
				gameState: lobbyCode === 'MENU' ? GameState.MENU : state,
				oldGameState: this.oldGameState,
				isHost: (hostId && clientId && hostId === clientId) as boolean,
				hostId: hostId,
				clientId: clientId,
				comsSabotaged,
				currentCamera,
				lightRadius,
				lightRadiusChanged: lightRadius != this.lastState?.lightRadius,
				map,
				mod: this.loadedMod.id,
				closedDoors,
				currentServer: this.currentServer,
				maxPlayers,
				oldMeetingHud: this.oldMeetingHud,
			};
			//	const stateHasChanged = !equal(this.lastState, newState);
			if (state !== GameState.MENU || this.oldGameState !== GameState.MENU) {
				try {
					this.sendIPC(IpcRendererMessages.NOTIFY_GAME_STATE_CHANGED, newState);
				} catch (e) {
					process.exit(0);
				}
			}
			this.lastState = newState;
			this.oldGameState = state;
		}
		return null;
	}

	async initializeoffsets(): Promise<void> {
		console.log('INITIALIZEOFFSETS???');
		this.is_64bit = this.memory.checkIsX64Version();
		this.memory.setIs64Bit(this.is_64bit);

		const offsetLookups = (await fetchOffsetLookup()) as IOffsetsLookup;
		let broadcastVersionAddr = undefined;
		if (this.is_64bit) {
			broadcastVersionAddr = this.memory.findPattern(
				offsetLookups.patterns.x64.broadcastVersion.sig,
				offsetLookups.patterns.x64.broadcastVersion.patternOffset,
				offsetLookups.patterns.x64.broadcastVersion.addressOffset,
				false,
				true
			);
		} else {
			broadcastVersionAddr = this.memory.findPattern(
				offsetLookups.patterns.x86.broadcastVersion.sig,
				offsetLookups.patterns.x86.broadcastVersion.patternOffset,
				offsetLookups.patterns.x86.broadcastVersion.addressOffset,
				false,
				true
			);
		}

		const broadcastVersion = this.memory.readMemory<number>(
			'int',
			this.gameAssembly!.modBaseAddr,
			broadcastVersionAddr
		);
		console.log('broadcastVersion: ', broadcastVersion);

		if (offsetLookups.versions[broadcastVersion]) {
			this.offsets = await fetchOffsets(
				this.is_64bit,
				offsetLookups.versions[broadcastVersion].file,
				offsetLookups.versions[broadcastVersion].offsetsVersion
			);
		} else {
			this.offsets = await fetchOffsets(
				this.is_64bit,
				offsetLookups.versions['default'].file,
				offsetLookups.versions['default'].offsetsVersion
			); // can't find file for this client, return default
		}

		this.writer.disableWriting = this.offsets.disableWriting;
		this.oldMeetingHud = this.offsets.oldMeetingHud;

		const innerNetClient = this.memory.findPattern(
			this.offsets.signatures.innerNetClient.sig,
			this.offsets.signatures.innerNetClient.patternOffset,
			this.offsets.signatures.innerNetClient.addressOffset
		);

		const meetingHud = this.memory.findPattern(
			this.offsets.signatures.meetingHud.sig,
			this.offsets.signatures.meetingHud.patternOffset,
			this.offsets.signatures.meetingHud.addressOffset
		);
		const gameData = this.memory.findPattern(
			this.offsets.signatures.gameData.sig,
			this.offsets.signatures.gameData.patternOffset,
			this.offsets.signatures.gameData.addressOffset
		);
		const shipStatus = this.memory.findPattern(
			this.offsets.signatures.shipStatus.sig,
			this.offsets.signatures.shipStatus.patternOffset,
			this.offsets.signatures.shipStatus.addressOffset
		);
		const miniGame = this.memory.findPattern(
			this.offsets.signatures.miniGame.sig,
			this.offsets.signatures.miniGame.patternOffset,
			this.offsets.signatures.miniGame.addressOffset
		);

		const palette = this.memory.findPattern(
			this.offsets.signatures.palette.sig,
			this.offsets.signatures.palette.patternOffset,
			this.offsets.signatures.palette.addressOffset
		);

		const playerControl = this.memory.findPattern(
			this.offsets.signatures.playerControl.sig,
			this.offsets.signatures.playerControl.patternOffset,
			this.offsets.signatures.playerControl.addressOffset
		);
		if (this.offsets.newGameOptions) {
			const gameOptionsManager = this.memory.findPattern(
				this.offsets.signatures.gameOptionsManager.sig,
				this.offsets.signatures.gameOptionsManager.patternOffset,
				this.offsets.signatures.gameOptionsManager.addressOffset
			);
			this.offsets.gameoptionsData[0] = gameOptionsManager;
		} else {
			this.offsets.gameoptionsData[0] = playerControl;
		}
		this.offsets.palette[0] = palette;
		this.offsets.meetingHud[0] = meetingHud;
		this.offsets.allPlayersPtr[0] = gameData;
		this.offsets.innerNetClient.base[0] = innerNetClient;
		this.offsets.shipStatus[0] = shipStatus;
		this.offsets.miniGame[0] = miniGame;
		if (!this.is_64bit) {
			this.offsets.connectFunc = this.memory.findPattern(
				this.offsets.signatures.connectFunc.sig,
				this.offsets.signatures.connectFunc.patternOffset,
				this.offsets.signatures.connectFunc.addressOffset,
				true
			);
			this.offsets.fixedUpdateFunc = this.memory.findPattern(
				this.offsets.signatures.fixedUpdateFunc.sig,
				this.offsets.signatures.fixedUpdateFunc.patternOffset,
				this.offsets.signatures.fixedUpdateFunc.addressOffset,
				false,
				true
			);
			this.offsets.showModStampFunc = this.memory.findPattern(
				this.offsets.signatures.showModStamp.sig,
				this.offsets.signatures.showModStamp.patternOffset,
				this.offsets.signatures.showModStamp.addressOffset,
				false,
				true
			);
			this.offsets.modLateUpdateFunc = this.memory.findPattern(
				this.offsets.signatures.modLateUpdate.sig,
				this.offsets.signatures.modLateUpdate.patternOffset,
				this.offsets.signatures.modLateUpdate.addressOffset,
				false,
				true
			);
		}
		this.offsets.serverManager_currentServer[0] = this.memory.findPattern(
			this.offsets.signatures.serverManager.sig,
			this.offsets.signatures.serverManager.patternOffset,
			this.offsets.signatures.serverManager.addressOffset
		);

		this.colorsInitialized = false;
		console.log('serverManager_currentServer', this.offsets.serverManager_currentServer[0].toString(16));

		this.PlayerStruct = new Struct();
		for (const member of this.offsets.player.struct) {
			if (member.type === 'SKIP' && member.skip) {
				this.PlayerStruct = this.PlayerStruct.addMember(Struct.TYPES.SKIP(member.skip), member.name);
			} else {
				this.PlayerStruct = this.PlayerStruct.addMember<unknown>(
					Struct.TYPES[member.type] as ValueType<unknown>,
					member.name
				);
			}
		}
		console.log(
			JSON.stringify(
				this.offsets,
				function (k, v) {
					if (v instanceof Array && k != 'struct') return JSON.stringify(v);
					return v;
				},
				2
			)
				.replace(/\\/g, '')
				.replace(/"\[/g, '[')
				.replace(/\]"/g, ']')
				.replace(/"\{/g, '{')
				.replace(/\}"/g, '}')
		);
		this.writer.initializeWrites(this.offsets, this.is_linux, appVersion);
	}

	loadColors(): void {
		if (this.colorsInitialized) {
			return;
		}
		const palletePtr = this.memory.readMemory<number>('ptr', this.gameAssembly!.modBaseAddr, this.offsets!.palette);
		const PlayerColorsPtr = this.memory.readMemory<number>('ptr', palletePtr, this.offsets!.palette_playercolor);
		const ShadowColorsPtr = this.memory.readMemory<number>('ptr', palletePtr, this.offsets!.palette_shadowColor);

		const colorLength = this.memory.readMemory<number>('int', ShadowColorsPtr, this.offsets!.playerCount);
		console.log('Initializecolors', colorLength, this.loadedMod.id);

		if (
			!colorLength ||
			colorLength <= 0 ||
			colorLength > 300 ||
			(this.loadedMod.id == 'THE_OTHER_ROLES' && colorLength <= 18)
		) {
			return;
		}

		this.rainbowColor = -9999;
		const playercolors = [];
		for (let i = 0; i < colorLength; i++) {
			const playerColor = this.memory.readMemory<number>('uint32', PlayerColorsPtr, [
				this.offsets!.playerAddrPtr + i * 0x4,
			]);
			const shadowColor = this.memory.readMemory<number>('uint32', ShadowColorsPtr, [
				this.offsets!.playerAddrPtr + i * 0x4,
			]);
			if (i == 0 && playerColor != 4279308742) {
				return;
			}
			if (playerColor === 4278190080) {
				this.rainbowColor = i;
			}
			//4278190080
			playercolors[i] = [numberToColorHex(playerColor), numberToColorHex(shadowColor)];
		}
		this.colorsInitialized = colorLength > 0;
		this.playercolors = playercolors;
		try {
			this.sendIPC(IpcOverlayMessages.NOTIFY_PLAYERCOLORS_CHANGED, playercolors);
			GenerateAvatars(playercolors)
				.then(() => console.log('done generate'))
				.catch((e) => console.error(e));
		} catch (e) {
			/* Empty block */
		}
	}

	readCurrentServer(): void {
		const currentServer = this.memory.readMemory<number>(
			'ptr',
			this.gameAssembly!.modBaseAddr,
			this.offsets!.serverManager_currentServer
		);
		this.currentServer = this.memory.readString(currentServer);
	}

	parsePlayer(ptr: number, buffer: Buffer, LocalclientId = -1): Player | undefined {
		if (!this.PlayerStruct || !this.offsets) return undefined;

		const { data } = this.PlayerStruct.report<PlayerReport>(buffer, 0, {});

		if (this.is_64bit) {
			data.objectPtr = this.memory.readMemory('pointer', ptr, [this.PlayerStruct.getOffsetByName('objectPtr')]);
			data.outfitsPtr = this.memory.readMemory('pointer', ptr, [this.PlayerStruct.getOffsetByName('outfitsPtr')]);
			data.taskPtr = this.memory.readMemory('pointer', ptr, [this.PlayerStruct.getOffsetByName('taskPtr')]);
			data.rolePtr = this.memory.readMemory('pointer', ptr, [this.PlayerStruct.getOffsetByName('rolePtr')]);

			// data.name = this.memory.readMemory('pointer', ptr, [this.PlayerStruct.getOffsetByName('name')]);
		}
		const clientId = this.memory.readMemory<number>('uint32', data.objectPtr, this.offsets.player.clientId);
		const isLocal = clientId === LocalclientId && data.disconnected === 0;

		const positionOffsets = isLocal
			? [this.offsets.player.localX, this.offsets.player.localY]
			: [this.offsets.player.remoteX, this.offsets.player.remoteY];

		let x = this.memory.readMemory<number>('float', data.objectPtr, positionOffsets[0]);
		let y = this.memory.readMemory<number>('float', data.objectPtr, positionOffsets[1]);
		const currentOutfit = this.memory.readMemory<number>('uint32', data.objectPtr, this.offsets.player.currentOutfit);
		const isDummy = this.memory.readMemory<boolean>('boolean', data.objectPtr, this.offsets.player.isDummy);
		let name = 'error';
		let shiftedColor = -1;
		if (Object.prototype.hasOwnProperty.call(data, 'name')) {
			name = this.memory.readString(data.name, 1000).split(/<.*?>/).join('');
		} else {
			this.memory.readDictionary(data.outfitsPtr, 6, (k, v, i) => {
				const key = this.memory.readMemory<number>('int32', k);
				const val = this.memory.readMemory<number>('ptr', v);
				if (key === 0 && i == 0) {
					const namePtr = this.memory.readMemory<number>('pointer', val, this.offsets!.player.outfit.playerName); // 0x40
					data.color = this.memory.readMemory<number>('uint32', val, this.offsets!.player.outfit.colorId); // 0x14
					name = this.memory.readString(namePtr, 1000).split(/<.*?>/).join('');
					data.hat = this.memory.readString(
						this.memory.readMemory<number>('ptr', val, this.offsets!.player.outfit.hatId)
					);
					data.skin = this.memory.readString(
						this.memory.readMemory<number>('ptr', val, this.offsets!.player.outfit.skinId)
					);
					data.visor = this.memory.readString(
						this.memory.readMemory<number>('ptr', val, this.offsets!.player.outfit.visorId)
					);
					if (currentOutfit == 0 || currentOutfit > 10) return;
				} else if (key === currentOutfit) {
					shiftedColor = this.memory.readMemory<number>('uint32', val, this.offsets!.player.outfit.colorId); // 0x14
				}
			});

			const roleTeam = this.memory.readMemory<number>('uint32', data.rolePtr, this.offsets!.player.roleTeam);
			data.impostor = roleTeam;

			//	if (this.offsets!.player.nameText && shiftedColor == -1 && (this.loadedMod.id == "THE_OTHER_ROLES")) {
			//		let nameText = this.memory.readMemory<number>('ptr', data.objectPtr, this.offsets!.player.nameText);
			//		var nameText_name = this.memory.readString(nameText);
			//		if (nameText_name != name) {
			//			shiftedColor = data.color;
			//		}
			//	}
		}
		name = name.split(/<.*?>/).join('');
		let bugged = false;
		if (
			x === undefined ||
			y === undefined ||
			data.disconnected != 0 ||
			data.color < 0 ||
			data.color > this.playercolors.length
		) {
			x = 9999;
			y = 9999;
			bugged = true;
		}

		const x_round = parseFloat(x?.toFixed(4));
		const y_round = parseFloat(y?.toFixed(4));

		const nameHash = hashCode(name);
		const colorId = data.color === this.rainbowColor ? RainbowColorId : data.color;
		return {
			ptr,
			id: data.id,
			clientId: clientId,
			name,
			nameHash,
			colorId,
			hatId: data.hat ?? '',
			petId: data.pet ?? '',
			skinId: data.skin ?? '',
			visorId: data.visor ?? '',
			disconnected: data.disconnected != 0,
			isImpostor: data.impostor == 1,
			isDead: data.dead == 1,
			taskPtr: data.taskPtr,
			objectPtr: data.objectPtr,
			shiftedColor,
			bugged,
			inVent: this.memory.readMemory<number>('byte', data.objectPtr, this.offsets.player.inVent) > 0,
			isLocal,
			isDummy,
			x: x_round || x || 999,
			y: y_round || y || 999,
		};
	}
}
