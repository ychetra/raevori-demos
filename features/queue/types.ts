import type { Text } from "@/lib/i18n";

/** The three services every queue starts with. The owner can rename them and add more, so a ticket's service is any `ServiceId`. */
export type Service = "repair" | "pickup" | "payment";
/** A service's id: one of the defaults, or `service-N` for one the owner added. */
export type ServiceId = string;
export type TicketStatus = "waiting" | "called" | "done" | "left";
/** A counter number. A queue has 1-4 counters, numbered by position. */
export type Counter = 1 | 2 | 3 | 4;

export const SERVICES: Service[] = ["repair", "pickup", "payment"];
/** Every counter number a queue may have. */
export const COUNTERS: Counter[] = [1, 2, 3, 4];
/** The default services' letters in front of each ticket number: "R-016". A queue's own letters are in its `services`. */
export const PREFIX: Record<Service, string> = { repair: "R", pickup: "P", payment: "C" };

/** `counter` is set once the ticket is called and kept after it is done or left. */
export type Ticket = {
  id: string;
  room: string;
  number: string;
  service: ServiceId;
  status: TicketStatus;
  counter?: Counter;
  at: Partial<Record<TicketStatus, number>>;
};

/** A service as the owner set it: `prefix` is one letter A-Z, unique in the queue; `minutes` (1-30) is its average service time. */
export type ServiceConfig = { id: ServiceId; name: Text; prefix: string; minutes: number; hidden?: boolean };
/** `id` is the counter's number, its position in the queue's list. A closed counter can't call. */
export type CounterConfig = { id: Counter; name: Text; open: boolean };
/** Seconds between the board's auto-calls; 0 is off. */
export type AutoCall = 0 | 20 | 60;
export type QueueSettings = { name: string; autoCall: AutoCall };
/** What the owner's admin changes. Snapshots and config events carry all of it, never the PIN. */
export type QueueConfig = { services: ServiceConfig[]; counters: CounterConfig[]; settings: QueueSettings };

export type QueueEvent =
  | ({ type: "snapshot"; tickets: Ticket[] } & QueueConfig)
  | { type: "ticket"; ticket: Ticket }
  | ({ type: "config" } & QueueConfig);
/** `tickets` is in take order (oldest first). `pin` is the owner's admin PIN: only the queue's creator is told it. */
export type Queue = { id: string; tickets: Ticket[]; touchedAt: number; pin: string } & QueueConfig;
/** What a call changed: the counter's previous ticket (now done) and the next one it called, if anyone was waiting. */
export type CallResult = { done: Ticket | null; called: Ticket | null };
/** Today's numbers for the owner (Phnom Penh day): tickets done and left, and the average and longest wait (minutes, null before anyone was called). */
export type QueueStats = { day: string; served: number; left: number; avgWait: number | null; longestWait: number | null };
