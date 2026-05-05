import { IpcOverlayMessages, IpcRendererMessages } from '../common/ipc-messages';
import { GameState, AmongUsState, Player } from '../common/AmongUsState';
import { AmongusMod, modList } from '../common/Mods';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { io, Socket } from 'socket.io-client';

export default class GameReader {
  sendIPC: Electron.WebContents['send'];
  socket: Socket | null = null;
  loadedMod = modList[0];
  lastState: AmongUsState = {} as AmongUsState;

  constructor(sendIPC: Electron.WebContents['send']) {
    this.sendIPC = sendIPC;

    // Connect to pre-setup WebSocket server
    // Since no specific address is provided, use localhost and standard port
    // It can be adjusted based on the server.
    const wsUrl = process.env.WS_URL || 'ws://127.0.0.1:42069';
    this.socket = io(wsUrl);

    this.socket.on('connect', () => {
      console.log('Connected to Game State WebSocket');
      this.sendIPC(IpcRendererMessages.NOTIFY_GAME_OPENED, true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Game State WebSocket');
      this.sendIPC(IpcRendererMessages.NOTIFY_GAME_OPENED, false);
    });

    this.socket.on('state', (state: AmongUsState) => {
      this.lastState = state;
      try {
        this.sendIPC(IpcRendererMessages.NOTIFY_GAME_STATE_CHANGED, state);
      } catch (e) {
        console.error('Error sending state:', e);
      }
    });
  }

  async loop(): Promise<string | null> {
    // Legacy loop structure, kept for compatibility with ipc-handlers.ts
    // The actual update is done via WebSocket events now.
    return null;
  }

  joinGame(code: string, server: string): boolean {
    if (this.socket) {
      this.socket.emit('joinGame', { code, server });
      return true;
    }
    return false;
  }
}
