import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLiveFeed, POLL_MS, STALL_MS } from "@/lib/live-feed";

/** A stand-in for the browser's EventSource: tests push messages and errors by hand. */
class FakeSource {
  static all: FakeSource[] = [];
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.all.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(e: unknown) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

const json = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.all = [];
  vi.stubGlobal("EventSource", FakeSource);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const open = () => {
  const events: unknown[] = [];
  const onDown = vi.fn();
  const stop = openLiveFeed("/api/x/events", "/api/x", (e) => events.push(e), onDown);
  return { events, onDown, stop };
};

describe("openLiveFeed", () => {
  it("passes stream events through and never polls while the stream talks", async () => {
    const { events } = open();
    FakeSource.all[0].emit({ type: "snapshot", n: 1 });
    FakeSource.all[0].emit({ type: "order", id: "A1" });
    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    expect(events).toEqual([{ type: "snapshot", n: 1 }, { type: "order", id: "A1" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls the snapshot when the stream opens but stays silent (a proxy that buffers it)", async () => {
    fetchMock.mockResolvedValue(json(200, { orders: [], n: 2 }));
    const { events } = open();
    await vi.advanceTimersByTimeAsync(STALL_MS);
    expect(FakeSource.all[0].closed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { cache: "no-store" });
    expect(events).toEqual([{ type: "snapshot", orders: [], n: 2 }]);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(events).toHaveLength(2);
  });

  it("reports closed and stops polling once the snapshot is gone", async () => {
    fetchMock.mockResolvedValue(json(404));
    const { events } = open();
    await vi.advanceTimersByTimeAsync(STALL_MS);
    expect(events).toEqual([{ type: "closed" }]);
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through network errors, reporting each as down", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(json(200, { n: 3 }));
    const { events, onDown } = open();
    await vi.advanceTimersByTimeAsync(STALL_MS);
    expect(onDown).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(events).toEqual([{ type: "snapshot", n: 3 }]);
  });

  it("reconnects the stream after an error while the room exists", async () => {
    fetchMock.mockResolvedValue(json(200));
    const { onDown } = open();
    FakeSource.all[0].emit({ type: "snapshot" });
    FakeSource.all[0].onerror?.();
    expect(onDown).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeSource.all).toHaveLength(2);
  });

  it("reports closed after a stream error when the room is gone", async () => {
    fetchMock.mockResolvedValue(json(404));
    const { events } = open();
    FakeSource.all[0].onerror?.();
    await vi.advanceTimersByTimeAsync(STALL_MS * 2);
    expect(events).toEqual([{ type: "closed" }]);
    expect(FakeSource.all).toHaveLength(1);
  });

  it("stop closes the stream and ends polling", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const { stop } = open();
    await vi.advanceTimersByTimeAsync(STALL_MS);
    stop();
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
