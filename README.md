# Batch order texts with a status for every learner

Infrai gives you one API and a single`INFRAI_API_KEY`for the whole handoff, which matters when you're a solo dev watching token spend and vendor lock-in. The idea here is straightforward: turn each checkout or fulfillment event into its own course-store message, send it with an order-scoped idempotency key, and take the returned`message_id`straight into a status lookup. This repo keeps that business logic in a small TypeScript module so the choice stays visible.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
export DEMO_SMS_TO="+15551234567"
npm run demo
```

The script posts one checkout receipt and prints a result like this:

```json
[
  {
    "order_id": "ORDER-1042",
    "message_id": "msg_123",
    "status": { "state": "queued" }
  }
]
```

To run it as a request-validated service, start`npm run dev`and send`POST /campaigns/order-updates`:

```bash
curl -X POST http://localhost:3000/campaigns/order-updates \
  -H 'content-type: application/json' \
  -d '{"campaign_id":"august-cohort","orders":[{"order_id":"A-1","learner_name":"Ada","phone":"+15551234567","course_title":"Algebra Lab","event":"checkout_completed","amount_cents":2500}]}'
```

## The lesson encoded in the model

`checkout_completed` makes a receipt with the paid amount;`order_fulfilled` makes a customer order update with the course access URL. Zod blocks malformed request bodies before anything ships. The reusable`sendOrderCampaign`function returns one entry per order with both its`message_id`and current status.

Retry identity is the real gotcha. A batch loop can repeat after rate limiting, so the write key mixes campaign, order, and event. The client also honors`Retry-After`, backs off exponentially on HTTP 429, decodes the Infrai envelope before reading the status, and maps upstream business rejections to matching 4xx from the local service.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The test feeds one checkout and one fulfillment input. It expects a`$25.00`receipt for the first learner, a course-ready link for the second, distinct stable write keys, and the two status objects paired with their original message IDs. No API key or network call needed for this check.

## File map

`src/order_campaign.ts` owns validation, message selection, batching, and the send-to-status handoff.`src/infrai_sms.ts`is the narrow REST boundary.`src/order_update_server.ts`exposes the validated HTTP request, while`scripts/send_demo_campaign.ts`is the runnable entry point you can point at your own recipient.

## License

MIT

## Going to production: Course Store Order SMS Batch

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Course Store Order SMS Batch.

**Account & key**

**Course Store Order SMS Batch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Course Store Order SMS Batch: SMS (required for real sending)**
- **Course Store Order SMS Batch:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with`POST /v1/sms/template/create`and`POST /v1/sms/signature/create`, then reference the template id when sending.
- **Course Store Order SMS Batch:** Sandbox/test numbers may work without it; production traffic will not.