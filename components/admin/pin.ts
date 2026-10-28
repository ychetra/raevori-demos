/**
 * The admin PIN is told only to the page that created the room, so that page keeps it in sessionStorage per room
 * (under `prefix`) to show "Owner admin · PIN 4821" after a reload. Storage can be blocked: every access is guarded.
 */
export function pinStore(prefix: string) {
  const key = (room: string) => `${prefix}:${room}`;
  return {
    save(room: string, pin: string): void {
      try {
        sessionStorage.setItem(key(room), pin);
      } catch {}
    },
    read(room: string): string | null {
      try {
        const pin = sessionStorage.getItem(key(room));
        return pin && /^\d{4}$/.test(pin) ? pin : null;
      } catch {
        return null;
      }
    },
  };
}
