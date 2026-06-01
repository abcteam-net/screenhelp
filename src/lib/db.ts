// IndexedDB schema for chat history and persisted settings, using Dexie.
import Dexie, { type Table } from "dexie";
import type { ChatTurn, Settings } from "./types";

interface SettingsRow {
  id: "singleton";
  value: Settings;
}

class ScreenHelpDB extends Dexie {
  turns!: Table<ChatTurn, string>;
  settings!: Table<SettingsRow, string>;

  constructor() {
    super("screenhelp");
    this.version(1).stores({
      turns: "id, sessionId, createdAt, mode",
      settings: "id",
    });
  }
}

let _db: ScreenHelpDB | null = null;
export function db(): ScreenHelpDB {
  if (typeof window === "undefined") {
    // Dexie will throw if instantiated on the server
    throw new Error("db() called on server");
  }
  if (!_db) _db = new ScreenHelpDB();
  return _db;
}
