export type Service = "repair" | "pickup" | "payment";
export type TicketStatus = "waiting" | "called" | "done" | "left";
export type Counter = 1 | 2;

export const SERVICES: Service[] = ["repair", "pickup", "payment"];
export const COUNTERS: Counter[] = [1, 2];
/** The letter in front of each ticket number: "R-016". */
export const PREFIX: Record<Service, string> = { repair: "R", pickup: "P", payment: "C" };

/** `counter` is set once the ticket is called and kept after it is done or left. */
export type Ticket = {
  id: string;
  room: string;
  number: string;
  service: Service;
  status: TicketStatus;
  counter?: Counter;
  at: Partial<Record<TicketStatus, number>>;
};

export type QueueEvent = { type: "snapshot"; tickets: Ticket[] } | { type: "ticket"; ticket: Ticket };
/** `tickets` is in take order (oldest first). */
export type Queue = { id: string; tickets: Ticket[]; touchedAt: number };
/** What a call changed: the counter's previous ticket (now done) and the next one it called, if anyone was waiting. */
export type CallResult = { done: Ticket | null; called: Ticket | null };
