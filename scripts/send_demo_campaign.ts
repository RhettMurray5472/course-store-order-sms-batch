import { createInfraiSms } from "../src/infrai_sms.js";
import { campaignRequestSchema, sendOrderCampaign } from "../src/order_campaign.js";

const apiKey = process.env.INFRAI_API_KEY;
const phone = process.env.DEMO_SMS_TO;
if (!apiKey || !phone) throw new Error("INFRAI_API_KEY and DEMO_SMS_TO are required");

const campaign = campaignRequestSchema.parse({
  campaign_id: `course-launch-${new Date().toISOString().slice(0, 10)}`,
  orders: [{
    order_id: "ORDER-1042",
    learner_name: "Mina",
    phone,
    course_title: "Practical TypeScript",
    event: "checkout_completed",
    amount_cents: 4900,
  }],
});

console.log(JSON.stringify(await sendOrderCampaign(campaign, createInfraiSms(apiKey)), null, 2));
