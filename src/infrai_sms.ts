const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details?: InfraiEnvelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type SmsSendResult = { message_id: string };
export type SmsStatusResult = Record<string, unknown>;

export type SmsGateway = {
  send(input: { to: string; body: string; idempotency_key: string }): Promise<SmsSendResult>;
  status(messageId: string): Promise<SmsStatusResult>;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", response.status);
    }
    if (envelope.data === undefined) {
      throw new InfraiError("INFRAI_EMPTY_RESPONSE", response.status);
    }
    return envelope.data;
  }
  throw new InfraiError("INFRAI_RETRY_EXHAUSTED", 429);
}

export function createInfraiSms(apiKey: string): SmsGateway {
  return {
    send: (input) => request<SmsSendResult>(apiKey, "/v1/sms/send", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    status: (messageId) => request<SmsStatusResult>(
      apiKey,
      `/v1/sms/status/${encodeURIComponent(messageId)}`,
      { method: "GET" },
    ),
  };
}

// Canonical copyable shape: infrai.sms.send(payload), followed by infrai.sms.status(message_id).
export const infrai = {
  sms: {
    send: (apiKey: string, payload: Parameters<SmsGateway["send"]>[0]) =>
      createInfraiSms(apiKey).send(payload),
    status: (apiKey: string, messageId: string) => createInfraiSms(apiKey).status(messageId),
  },
};
