import { describe, expect, it } from "vitest";
import { bootWorld, parseIntake, submitIntake, useWorld } from "./store";

void useWorld;

describe("live intake composer", () => {
  bootWorld();

  it("accepts a raw message and queues it as NEW", () => {
    const msg = submitIntake({
      channel: "WHATSAPP",
      from: "Nairobi AgriSupply Co",
      raw: "urgent: 6 pallets of pump spares, 2,400 kg, 9 cbm, from Karachi to Jeddah by sea, CIF, by 28 Jul",
    });
    expect(msg.status).toBe("NEW");
    expect(msg.id).toMatch(/^in-\d+$/);
  });

  it("the submitted message flows through the local parser end to end", () => {
    const msg = submitIntake({
      channel: "EMAIL",
      from: "Gulf Horizon Trading",
      raw: "please quote 2 containers of ceramic tiles, 21 tons, 40 cbm, from Shanghai to Jebel Ali by sea, FOB",
    });
    parseIntake(msg.id);
    expect(msg.status).toBe("PARSED");
    expect(msg.parsedBy).toBe("local parser");
    expect(msg.extraction?.origin.value).toBe("CNSHA Shanghai");
    expect(msg.extraction?.destination.value).toBe("AEJEA Jebel Ali");
    expect(msg.extraction?.weightKg.value).toBe(21_000);
    expect(msg.extraction?.incoterm.value).toBe("FOB");
  });

  it("parsing is idempotent — a second parse doesn't clobber", () => {
    const msg = submitIntake({
      channel: "WHATSAPP",
      from: "Adeyemi Machinery Ltd",
      raw: "3 pallets of valves, 800 kg, Lagos to Jebel Ali by air, CIF",
    });
    parseIntake(msg.id);
    const first = msg.extraction;
    parseIntake(msg.id); // status is PARSED now — should be a no-op
    expect(msg.extraction).toBe(first);
  });
});
