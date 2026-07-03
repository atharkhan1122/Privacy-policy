import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliver, emailProvider, outbox } from "@/server/mailer";

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.resend = process.env.RESEND_API_KEY;
  saved.hook = process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
  saved.from = process.env.ENGINE_ROOM_EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
  delete process.env.ENGINE_ROOM_EMAIL_FROM;
});

afterEach(() => {
  for (const [k, envKey] of [
    ["resend", "RESEND_API_KEY"],
    ["hook", "ENGINE_ROOM_EMAIL_WEBHOOK"],
    ["from", "ENGINE_ROOM_EMAIL_FROM"],
  ] as const) {
    if (saved[k] === undefined) delete process.env[envKey];
    else process.env[envKey] = saved[k];
  }
  vi.restoreAllMocks();
});

let n = 0;
const msg = () => ({
  to: `u${Date.now()}_${n++}@x.test`,
  subject: `subj-${Date.now()}-${n}`,
  text: "body",
  link: "https://engine.test/reset?token=abc",
});

const okFetch = () =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })) as unknown as typeof fetch;

describe("mailer provider selection", () => {
  it("reports the active provider from env", () => {
    expect(emailProvider()).toBe("outbox");
    process.env.ENGINE_ROOM_EMAIL_WEBHOOK = "https://hook.test";
    expect(emailProvider()).toBe("webhook");
    process.env.RESEND_API_KEY = "re_test";
    expect(emailProvider()).toBe("resend"); // resend wins over webhook
  });

  it("sends via the Resend REST API with Bearer auth and from address", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.ENGINE_ROOM_EMAIL_FROM = "Ops <ops@engine.test>";
    const fetchMock = okFetch();
    global.fetch = fetchMock;

    const m = msg();
    await deliver(m);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Ops <ops@engine.test>");
    expect(body.to).toEqual([m.to]);
    expect(body.subject).toBe(m.subject);
    // A real provider send does NOT touch the operator outbox.
    expect(outbox().find((e) => e.subject === m.subject)).toBeUndefined();
  });

  it("posts the raw message to a configured webhook", async () => {
    process.env.ENGINE_ROOM_EMAIL_WEBHOOK = "https://hook.test/mail";
    const fetchMock = okFetch();
    global.fetch = fetchMock;

    const m = msg();
    await deliver(m);

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://hook.test/mail");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: m.to, subject: m.subject, link: m.link });
    expect(outbox().find((e) => e.subject === m.subject)).toBeUndefined();
  });

  it("records to the operator outbox when no provider is set", async () => {
    const m = msg();
    await deliver(m);
    expect(outbox().find((e) => e.subject === m.subject)).toBeTruthy();
  });

  it("falls back to the outbox when a configured provider fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    })) as unknown as typeof fetch;

    const m = msg();
    await deliver(m); // must not throw
    // The link isn't lost — it lands in the outbox for manual relay.
    expect(outbox().find((e) => e.subject === m.subject)).toBeTruthy();
  });
});
