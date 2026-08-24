import assert from "node:assert/strict";
import test from "node:test";
import type { SmsGateway } from "../src/infrai_sms.js";
import { campaignRequestSchema, sendOrderCampaign } from "../src/order_campaign.js";

test("checkout and fulfillment choose different messages and retain per-message status", async () => {
  const sent: Array<{ to: string; body: string; idempotency_key: string }> = [];
  const sms: SmsGateway = {
    async send(input) {
      sent.push(input);
      return { message_id: `msg-${sent.length}` };
    },
    async status(messageId) {
      return { state: messageId === "msg-1" ? "delivered" : "queued" };
    },
  };
  const request = campaignRequestSchema.parse({
    campaign_id: "august-cohort",
    orders: [
      { order_id: "A-1", learner_name: "Ada", phone: "+15550000001", course_title: "Algebra Lab", event: "checkout_completed", amount_cents: 2500 },
      { order_id: "A-2", learner_name: "Lin", phone: "+15550000002", course_title: "Geometry Lab", event: "order_fulfilled", access_url: "https://learn.example/course/A-2" },
    ],
  });

  const result = await sendOrderCampaign(request, sms);

  assert.match(sent[0].body, /receipt.*\$25\.00/);
  assert.match(sent[1].body, /is ready.*learn\.example/);
  assert.equal(sent[0].idempotency_key, "august-cohort:A-1:checkout_completed");
  assert.deepEqual(result.map(({ message_id, status }) => ({ message_id, status })), [
    { message_id: "msg-1", status: { state: "delivered" } },
    { message_id: "msg-2", status: { state: "queued" } },
  ]);
});
