import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { safeEqual } from "@/server/safe-equal";
import { POST as whatsappWebhook } from "@/app/api/webhooks/whatsapp/route";
import { verifySignature } from "@/server/webhook-auth";

const KEY = "erk_test_0123456789";
const SECRET = "meta-app-secret";

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv.keys = process.env.ENGINE_ROOM_API_KEYS;
  savedEnv.secret = process.env.ENGINE_ROOM_WHATSAPP_SECRET;
});

afterEach(() => {
  if (savedEnv.keys === undefined) delete process.env.ENGINE_ROOM_API_KEYS;
  else process.env.ENGINE_ROOM_API_KEYS = savedEnv.keys;
  if (savedEnv.secret === undefined) delete process.env.ENGINE_ROOM_WHATSAPP_SECRET;
  else process.env.ENGINE_ROOM_WHATSAPP_SECRET = savedEnv.secret;
});

function apiRequest(headers: Record<string, string> = {}, path = "/api/shipments") {
  return new NextRequest(`http://engine.room${path}`, { headers });
}

describe("API-key middleware", () => {
  it("runs open when no keys are configured", () => {
    delete process.env.ENGINE_ROOM_API_KEYS;
    expect(middleware(apiRequest()).status).toBe(200);
  });

  it("rejects missing and wrong keys with 401", () => {
    process.env.ENGINE_ROOM_API_KEYS = KEY;
    expect(middleware(apiRequest()).status).toBe(401);
    expect(middleware(apiRequest({ "x-api-key": "erk_wrong" })).status).toBe(401);
    expect(middleware(apiRequest({ authorization: "Bearer nope" })).status).toBe(401);
  });

  it("accepts the key via x-api-key and Authorization: Bearer", () => {
    process.env.ENGINE_ROOM_API_KEYS = ` ${KEY} , erk_second`;
    expect(middleware(apiRequest({ "x-api-key": KEY })).status).toBe(200);
    expect(middleware(apiRequest({ authorization: `Bearer ${KEY}` })).status).toBe(200);
    expect(middleware(apiRequest({ "x-api-key": "erk_second" })).status).toBe(200);
  });

  it("exempts the webhook path — Meta cannot send custom headers", () => {
    process.env.ENGINE_ROOM_API_KEYS = KEY;
    expect(middleware(apiRequest({}, "/api/webhooks/whatsapp")).status).toBe(200);
  });
});

describe("WhatsApp webhook signature", () => {
  const body = JSON.stringify({
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "Signed Sender" } }],
          messages: [{ type: "text", text: { body: "signed hello, 100 kg from Lagos to Jeddah" } }],
        },
      }],
    }],
  });

  const sign = (payload: string, secret: string) =>
    `sha256=${crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;

  it("verifySignature accepts the genuine HMAC and rejects forgeries", () => {
    expect(verifySignature(body, sign(body, SECRET), SECRET)).toBe(true);
    expect(verifySignature(body, sign(body, "other-secret"), SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=deadbeef", SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
  });

  it("rejects unsigned deliveries when the secret is configured", async () => {
    process.env.ENGINE_ROOM_WHATSAPP_SECRET = SECRET;
    const res = await whatsappWebhook(
      new Request("http://engine.room/api/webhooks/whatsapp", { method: "POST", body })
    );
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed delivery", async () => {
    process.env.ENGINE_ROOM_WHATSAPP_SECRET = SECRET;
    const res = await whatsappWebhook(
      new Request("http://engine.room/api/webhooks/whatsapp", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": sign(body, SECRET) },
      })
    );
    expect(res.status).toBe(201);
  });

  it("stays open in demo mode when no secret is configured", async () => {
    delete process.env.ENGINE_ROOM_WHATSAPP_SECRET;
    const res = await whatsappWebhook(
      new Request("http://engine.room/api/webhooks/whatsapp", { method: "POST", body })
    );
    expect(res.status).toBe(201);
  });
});

describe("safeEqual", () => {
  it("compares without early exit semantics", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
