import type { Word } from "@kridens/core";
import { Room, type RoomOptions } from "./room.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to avoid confusion

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(hostId: string, wordPool: Word[], options?: RoomOptions): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = new Room(code, hostId, wordPool, options);
    // A room whose host never reconnects (closed tab, abandoned for a different room, etc.)
    // closes itself after a grace period — drop it from the registry the same way an explicit
    // close_room does, so it stops being joinable and doesn't linger in memory forever.
    room.onAbandoned = () => this.rooms.delete(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }
}
