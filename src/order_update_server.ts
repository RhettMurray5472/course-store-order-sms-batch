import { createServer } from "node:http";
import { ZodError } from "zod";
import { createInfraiSms, InfraiError } from "./infrai_sms.js";
import { campaignRequestSchema, sendOrderCampaign } from "./order_campaign.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const sms = createInfraiSms(apiKey);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/campaigns/order-updates") {
    response.writeHead(404).end(JSON.stringify({ error: "route not found" }));
    return;
  }

  try {
    const campaign = campaignRequestSchema.parse(await readJson(request));
    const messages = await sendOrderCampaign(campaign, sms);
    response.writeHead(200).end(JSON.stringify({ campaign_id: campaign.campaign_id, messages }));
  } catch (error) {
    if (error instanceof ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(400).end(JSON.stringify({ error: error instanceof Error ? error.message : "invalid request" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order update service listening on http://localhost:${port}`));
