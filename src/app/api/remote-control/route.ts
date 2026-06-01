import { NextResponse } from "next/server";

type RemoteCommandType = "instant" | "cumulative" | "reset-cumulative";

interface RemoteCommand {
  id: number;
  type: RemoteCommandType;
  createdAt: number;
}

interface RemoteResult {
  id: number;
  commandId: number;
  type: RemoteCommandType;
  createdAt: number;
  status: "done" | "error";
  answer?: string;
  error?: string;
}

interface RemoteConfig {
  enabled: boolean;
  instantHotkey: string;
  cumulativeHotkey: string;
  toggleListeningHotkey: string;
}

const globalForRemote = globalThis as typeof globalThis & {
  __screenhelpRemoteCommands?: RemoteCommand[];
  __screenhelpRemoteNextId?: number;
  __screenhelpRemoteResults?: RemoteResult[];
  __screenhelpRemoteNextResultId?: number;
  __screenhelpRemoteConfig?: RemoteConfig;
};

function commandQueue() {
  if (!globalForRemote.__screenhelpRemoteCommands) globalForRemote.__screenhelpRemoteCommands = [];
  if (!globalForRemote.__screenhelpRemoteNextId) globalForRemote.__screenhelpRemoteNextId = 1;
  return globalForRemote.__screenhelpRemoteCommands;
}

function resultQueue() {
  if (!globalForRemote.__screenhelpRemoteResults) globalForRemote.__screenhelpRemoteResults = [];
  if (!globalForRemote.__screenhelpRemoteNextResultId) globalForRemote.__screenhelpRemoteNextResultId = 1;
  return globalForRemote.__screenhelpRemoteResults;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldFetchCommands = url.searchParams.has("after");
  const after = Number(url.searchParams.get("after") || "0");
  const afterResult = Number(url.searchParams.get("afterResult") || "0");
  const commands = shouldFetchCommands ? commandQueue().filter((cmd) => cmd.id > after) : [];
  if (commands.length > 0) {
    const maxCommandId = Math.max(...commands.map((cmd) => cmd.id));
    const queue = commandQueue();
    globalForRemote.__screenhelpRemoteCommands = queue.filter((cmd) => cmd.id > maxCommandId);
  }
  const results = resultQueue().filter((result) => result.id > afterResult);
  return NextResponse.json({ commands, results, config: globalForRemote.__screenhelpRemoteConfig || null });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.kind === "config") {
    const remote = body?.remote;
    if (
      !remote ||
      typeof remote.instantHotkey !== "string" ||
      typeof remote.cumulativeHotkey !== "string"
    ) {
      return NextResponse.json({ error: "Invalid remote config." }, { status: 400 });
    }
    globalForRemote.__screenhelpRemoteConfig = {
      enabled: typeof remote.enabled === "boolean" ? remote.enabled : true,
      instantHotkey: remote.instantHotkey,
      cumulativeHotkey: remote.cumulativeHotkey,
      toggleListeningHotkey:
        typeof remote.toggleListeningHotkey === "string"
          ? remote.toggleListeningHotkey
          : "T",
    };
    return NextResponse.json({ config: globalForRemote.__screenhelpRemoteConfig });
  }

  if (body?.kind === "listening") {
    const enabled = body?.enabled;
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Expected enabled boolean." }, { status: 400 });
    }
    const current = globalForRemote.__screenhelpRemoteConfig || {
      enabled: true,
      instantHotkey: "I",
      cumulativeHotkey: "C",
      toggleListeningHotkey: "T",
    };
    globalForRemote.__screenhelpRemoteConfig = { ...current, enabled };
    return NextResponse.json({ config: globalForRemote.__screenhelpRemoteConfig });
  }

  if (body?.kind === "result") {
    const commandId = Number(body?.commandId);
    const type = body?.type;
    const status = body?.status;
    if (!commandId || (type !== "instant" && type !== "cumulative") || (status !== "done" && status !== "error")) {
      return NextResponse.json({ error: "Invalid remote result." }, { status: 400 });
    }

    const results = resultQueue();
    const result: RemoteResult = {
      id: globalForRemote.__screenhelpRemoteNextResultId!,
      commandId,
      type,
      status,
      answer: typeof body?.answer === "string" ? body.answer : undefined,
      error: typeof body?.error === "string" ? body.error : undefined,
      createdAt: Date.now(),
    };
    globalForRemote.__screenhelpRemoteNextResultId = result.id + 1;
    results.push(result);
    if (results.length > 50) results.splice(0, results.length - 50);
    return NextResponse.json({ result });
  }

  const type = body?.type;
  if (type !== "instant" && type !== "cumulative" && type !== "reset-cumulative") {
    return NextResponse.json({ error: "Expected type to be instant, cumulative, or reset-cumulative." }, { status: 400 });
  }

  if (type === "reset-cumulative") {
    globalForRemote.__screenhelpRemoteResults = [];
    globalForRemote.__screenhelpRemoteNextResultId = 1;
  }

  const commands = commandQueue();
  const command: RemoteCommand = {
    id: globalForRemote.__screenhelpRemoteNextId!,
    type,
    createdAt: Date.now(),
  };
  globalForRemote.__screenhelpRemoteNextId = command.id + 1;
  commands.push(command);
  if (commands.length > 50) commands.splice(0, commands.length - 50);

  return NextResponse.json({ command });
}
