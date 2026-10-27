import { UNKNOWN_IP } from "@/lib/client-ip";

export type LimitReason = "session" | "ip" | "global" | "length";

const PHNOM_PENH_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 all year, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chat guards: messages per session and per IP, model calls per IP and in total per day, characters per message.
 * A message can cost several model calls, so each IP also has its own model-call budget and one visitor
 * cannot spend the whole day's budget. All in memory.
 */
export function createLimiter(
  opts: { perSession?: number; perIpDay?: number; globalDay?: number; perIpModelDay?: number; maxChars?: number; now?: () => number } = {},
) {
  const perSession = opts.perSession ?? 20;
  const perIpDay = opts.perIpDay ?? 60;
  const globalDay = opts.globalDay ?? (Number(process.env.CHAT_GLOBAL_DAILY_CAP) || 200);
  const perIpModelDay = opts.perIpModelDay ?? Math.max(4, Math.floor(globalDay / 4));
  const maxChars = opts.maxChars ?? 300;
  const now = opts.now ?? Date.now;

  let day = -1;
  let sessions = new Map<string, number>();
  let ips = new Map<string, number>();
  let ipModelCalls = new Map<string, number>();
  let modelCalls = 0;

  // Counters (sessions included) start fresh each Phnom Penh day, which also bounds memory.
  function roll() {
    const d = Math.floor((now() + PHNOM_PENH_OFFSET_MS) / DAY_MS);
    if (d === day) return;
    day = d;
    sessions = new Map();
    ips = new Map();
    ipModelCalls = new Map();
    modelCalls = 0;
  }

  return {
    check(session: string, ip: string, text: string): { ok: true } | { ok: false; reason: LimitReason } {
      roll();
      if ([...text].length > maxChars) return { ok: false, reason: "length" };
      if (modelCalls >= globalDay) return { ok: false, reason: "global" };
      const limitIp = ip !== UNKNOWN_IP;
      if (limitIp && (ipModelCalls.get(ip) ?? 0) >= perIpModelDay) return { ok: false, reason: "ip" };
      const s = sessions.get(session) ?? 0;
      if (s >= perSession) return { ok: false, reason: "session" };
      const i = ips.get(ip) ?? 0;
      if (limitIp && i >= perIpDay) return { ok: false, reason: "ip" };
      sessions.set(session, s + 1);
      ips.set(ip, i + 1);
      return { ok: true };
    },
    /** Counts one model call against the IP's and the global daily budget; false means one is used up and the call must not be made. */
    countModelCall(ip: string): boolean {
      roll();
      const i = ipModelCalls.get(ip) ?? 0;
      if (modelCalls >= globalDay || (ip !== UNKNOWN_IP && i >= perIpModelDay)) return false;
      ipModelCalls.set(ip, i + 1);
      modelCalls++;
      return true;
    },
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
