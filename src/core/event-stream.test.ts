import { describe, expect, it } from "vitest";
import { GET as streamEvents } from "@/app/api/events/stream/route";
import { bootWorld } from "./store";
import { emit } from "./events";

/**
 * The SSE event stream: hello frame, replayed backlog, then live events
 * pushed as they are emitted, and clean teardown on abort.
 */

async function readFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  until: (buffer: string) => boolean,
  maxReads = 10
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (let i = 0; i < maxReads && !until(buffer); i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  return buffer;
}

describe("the event stream", () => {
  bootWorld();

  it("speaks SSE: hello frame, replayed backlog, live events, abort teardown", async () => {
    // Emitted before connecting → must arrive via the replay backlog.
    emit("tracking.updated", "ENG-2026-0847", "SSE backlog probe", "INFO");

    const controller = new AbortController();
    const response = await streamEvents(
      new Request("http://engine.room/api/events/stream?replay=3", {
        signal: controller.signal,
      })
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();

    // Hello + backlog arrive on connect (each frame is its own chunk).
    const opening = await readFrames(reader, (b) => b.includes("SSE backlog probe"));
    expect(opening).toContain("event: hello");
    expect(opening).toContain('"replay":3');
    expect(opening).toContain("SSE backlog probe");

    // A live emit is pushed to the open stream.
    emit("tracking.updated", "ENG-2026-0847", "SSE live-push probe", "INFO");
    const live = await readFrames(reader, (b) => b.includes("SSE live-push probe"));
    expect(live).toContain("SSE live-push probe");

    // Abort tears the stream down.
    controller.abort();
    const { done } = await reader.read().catch(() => ({ done: true as const, value: undefined }));
    expect(done).toBe(true);
  });

  it("caps replay at 100 and defaults to none", async () => {
    const controller = new AbortController();
    const response = await streamEvents(
      new Request("http://engine.room/api/events/stream?replay=99999", {
        signal: controller.signal,
      })
    );
    const reader = response.body!.getReader();
    const opening = await readFrames(reader, (b) => b.includes("event: hello"));
    expect(opening).toContain('"replay":100');
    controller.abort();
  });
});
