import { describe, expect, it } from "vitest";
import { GET as listShipments } from "@/app/api/shipments/route";
import { GET as getShipment } from "@/app/api/shipments/[id]/route";
import { POST as quoteShipment } from "@/app/api/shipments/[id]/quote/route";
import { POST as acceptQuote } from "@/app/api/quotes/[id]/accept/route";
import { POST as submitIntake } from "@/app/api/intake/route";
import { POST as parseIntake } from "@/app/api/intake/[id]/parse/route";
import { POST as convertIntake } from "@/app/api/intake/[id]/convert/route";
import { POST as whatsappWebhook } from "@/app/api/webhooks/whatsapp/route";
import { GET as getGraph } from "@/app/api/graph/route";
import { GET as getEvents } from "@/app/api/events/route";

/**
 * The API plane, exercised end to end: a WhatsApp webhook drops a message
 * into intake, it is parsed, converted, quoted, and the customer's accept
 * books it — every step over the same HTTP contracts external systems use.
 */

const p = (id: string) => ({ params: Promise.resolve({ id }) });

function post(url: string, body?: unknown): Request {
  return new Request(`http://engine.room${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("the API plane", () => {
  it("lists the fleet and filters by state", async () => {
    const all = await (await listShipments(new Request("http://engine.room/api/shipments"))).json();
    expect(all.count).toBeGreaterThanOrEqual(8);
    const transit = await (
      await listShipments(new Request("http://engine.room/api/shipments?state=TRANSIT"))
    ).json();
    expect(transit.shipments.every((s: { state: string }) => s.state === "TRANSIT")).toBe(true);
  });

  it("serves the shipment object with every derived view attached", async () => {
    const res = await getShipment(new Request("http://engine.room"), p("ENG-2026-0847"));
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.customer.name).toBe("Adeyemi Machinery Ltd");
    expect(Array.isArray(detail.documents)).toBe(true);
    expect(Array.isArray(detail.tracking)).toBe(true);
    expect(detail.tracking.length).toBeGreaterThan(0);
  });

  it("404s unknown shipments instead of inventing them", async () => {
    const res = await getShipment(new Request("http://engine.room"), p("ENG-9999-0000"));
    expect(res.status).toBe(404);
  });

  it("runs the whole lifecycle over HTTP: webhook → parse → convert → quote → accept", async () => {
    // 1. WhatsApp Business webhook delivers a text message.
    const hook = await whatsappWebhook(
      post("/api/webhooks/whatsapp", {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Pacific Components Inc" }, wa_id: "14155550100" }],
              messages: [{
                from: "14155550100",
                type: "text",
                text: { body: "Need 4 pallets of sensor modules, 900 kg, 3.5 cbm, from Singapore to Los Angeles by air, CIP, before 20 Jul" },
              }],
            },
          }],
        }],
      })
    );
    expect(hook.status).toBe(201);
    const { accepted } = await hook.json();
    const intakeId = accepted[0];

    // 2. Parse (no credentials in CI → deterministic parser).
    const parsed = await (await parseIntake(new Request("http://engine.room"), p(intakeId))).json();
    expect(parsed.status).toBe("PARSED");
    expect(parsed.extraction.origin.value).toBe("SGSIN Singapore");
    expect(parsed.extraction.mode.value).toBe("AIR");

    // 3. Convert to a live shipment.
    const converted = await convertIntake(new Request("http://engine.room"), p(intakeId));
    expect(converted.status).toBe(201);
    const shipment = await converted.json();
    expect(shipment.state).toBe("INQUIRY");

    // 4. Quote it.
    const quoted = await quoteShipment(new Request("http://engine.room"), p(shipment.id));
    expect(quoted.status).toBe(201);
    const quote = await quoted.json();
    expect(quote.options.length).toBeGreaterThanOrEqual(1);

    // 5. Customer accepts the best option — booking, docs, invoice in one command.
    const best = quote.options[0];
    const acceptedRes = await acceptQuote(
      post(`/api/quotes/${quote.id}/accept`, { optionId: best.id }),
      p(quote.id)
    );
    expect(acceptedRes.status).toBe(200);
    const booked = await acceptedRes.json();
    expect(booked.state).toBe("DOCUMENTATION");
    expect(booked.revenue).toBe(best.sellTotal);
    expect(booked.documents.length).toBeGreaterThan(0);
    expect(booked.invoices.length).toBe(1);
  });

  it("rejects double-acceptance of a quote", async () => {
    const won = await (await import("@/core/store")).worldSnapshot().quotes.find(
      (q) => q.verdict === "WON"
    );
    expect(won).toBeDefined();
    const res = await acceptQuote(
      post(`/api/quotes/${won!.id}/accept`, { optionId: won!.options[0].id }),
      p(won!.id)
    );
    expect(res.status).toBe(400);
  });

  it("validates intake submissions", async () => {
    const res = await submitIntake(post("/api/intake", { from: "x" })); // raw missing
    expect(res.status).toBe(400);
  });

  it("publishes the graph behind the privacy floor and the event stream", async () => {
    const graph = await (await getGraph(new Request("http://engine.room/api/graph"))).json();
    expect(graph.lanes.every((l: { observations: number }) => l.observations >= 25)).toBe(true);
    const events = await (
      await getEvents(new Request("http://engine.room/api/events?limit=5"))
    ).json();
    expect(events.count).toBeLessThanOrEqual(5);
  });
});
