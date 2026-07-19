/**
 * OTP / magic-link delivery interface (pluggable mailer).
 *
 * The interface lives here (see `tickets/real-auth/STUDY_FIRST.md` [C-MAILER]);
 * `authMode.ts` imports it for the `AuthConfig.otpMailer` slot. Concrete
 * implementations (`consoleMailer`, `webhookMailer`, `resolveMailer`) are
 * provided below.
 */

import type { AuthConfig } from './authMode.js';
import wretch from 'wretch';

export interface OtpMailerRequest {
    /** Recipient email. */
    to: string;
    /** One-time code, when the magic-link flow uses an OTP. */
    otp?: string;
    /** Full magic-link URL, when the flow uses links. */
    magicLink?: string;
    /** better-auth user id of the recipient. */
    userId: string;
    flow: 'magic-link' | 'email-verification';
}

/**
 * Pluggable mailer. The default implementation is chosen from
 * `AuthConfig.otpTransport` by `resolveMailer(cfg)`. A custom impl can
 * be supplied directly via `AuthConfig.otpMailer` (T-80 wires SendGrid/etc.).
 */
export type OtpMailer = (req: OtpMailerRequest) => Promise<void>;

/**
 * Console mailer — logs the magic-link / OTP to stdout so operators can
 * grab it from the logs during development. Marked with a clear delimiter.
 */
export async function consoleMailer(req: OtpMailerRequest): Promise<void> {
    const parts = [`[Mailer] flow=${req.flow} to=${req.to}`];
    if (req.otp !== undefined) parts.push(`otp=${req.otp}`);
    if (req.magicLink !== undefined) parts.push(`magicLink=${req.magicLink}`);
    parts.push(`userId=${req.userId}`);
    console.log(parts.join(' '));
}

/**
 * Webhook mailer — POSTs the full `OtpMailerRequest` as JSON to the given
 * URL. Throws on non-2xx so better-auth surfaces the delivery failure.
 */
export function webhookMailer(url: string): OtpMailer {
    return async (req: OtpMailerRequest): Promise<void> => {
        await wretch(url).json(req).post().res();
    };
}

/**
 * Resolve the mailer from the auth config. Priority:
 * 1. `cfg.otpMailer` — explicit custom override (T-80).
 * 2. `cfg.otpTransport === 'webhook'` → `webhookMailer(cfg.otpWebhookUrl)`.
 * 3. `cfg.otpTransport === 'sendgrid'` → throw (T-80 not yet implemented).
 * 4. Default → `consoleMailer`.
 */
export function resolveMailer(cfg: AuthConfig): OtpMailer {
    if (cfg.otpMailer) return cfg.otpMailer;
    if (cfg.otpTransport === 'webhook' && cfg.otpWebhookUrl) {
        return webhookMailer(cfg.otpWebhookUrl);
    }
    if (cfg.otpTransport === 'sendgrid') {
        throw new Error(
            'SendGrid mailer requires T-80; set MCP_AUTH_OTP_TRANSPORT=console or webhook for now.'
        );
    }
    return consoleMailer;
}
