import { z } from "zod";
import type { SmsGateway, SmsStatusResult } from "./infrai_sms.js";

export const campaignRequestSchema = z.object({
  campaign_id: z.string().min(1),
  orders: z.array(z.object({
    order_id: z.string().min(1),
    learner_name: z.string().min(1),
    phone: z.string().min(7),
    course_title: z.string().min(1),
    event: z.enum(["checkout_completed", "order_fulfilled"]),
    amount_cents: z.number().int().nonnegative().optional(),
    access_url: z.string().url().optional(),
  })).min(1).max(100),
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;

export type CampaignMessageResult = {
  order_id: string;
  message_id: string;
  status: SmsStatusResult;
};

export function composeOrderMessage(order: CampaignRequest["orders"][number]): string {
  if (order.event === "checkout_completed") {
    if (order.amount_cents === undefined) {
      throw new Error("amount_cents is required for a checkout receipt");
    }
    return `Hi ${order.learner_name}, receipt for ${order.course_title}: $${(order.amount_cents / 100).toFixed(2)}. Order ${order.order_id}.`;
  }
  if (!order.access_url) {
    throw new Error("access_url is required when course access is fulfilled");
  }
  return `Hi ${order.learner_name}, ${order.course_title} is ready. Open ${order.access_url}. Order ${order.order_id}.`;
}

export async function sendOrderCampaign(
  request: CampaignRequest,
  sms: SmsGateway,
): Promise<CampaignMessageResult[]> {
  return Promise.all(request.orders.map(async (order) => {
    const sent = await sms.send({
      to: order.phone,
      body: composeOrderMessage(order),
      idempotency_key: `${request.campaign_id}:${order.order_id}:${order.event}`,
    });
    const status = await sms.status(sent.message_id);
    return { order_id: order.order_id, message_id: sent.message_id, status };
  }));
}
