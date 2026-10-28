/**
 * The owner-admin PIN is told only to the page that created the queue, so the board keeps it in sessionStorage per queue
 * to show "Owner admin · PIN 4821" after a reload. Storage can be blocked (private mode, previews): every access is guarded.
 */
const key = (room: string) => `ra-queue-pin:${room}`;

export function savePin(room: string, pin: string): void {
  try {
    sessionStorage.setItem(key(room), pin);
  } catch {}
}

export function readPin(room: string): string | null {
  try {
    const pin = sessionStorage.getItem(key(room));
    return pin && /^\d{4}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}
