/**
 * OTP / magic-link delivery interface (pluggable mailer).
 *
 * The interface lives here (see `tickets/real-auth/STUDY_FIRST.md` [C-MAILER]);
 * `authMode.ts` imports it for the `AuthConfig.otpMailer` slot. The concrete
 * implementations (`consoleMailer`, `webhookMailer`, `resolveMailer`) land in
 * T-20 — this ticket only ships the type surface so `AuthConfig` can name it.
 */

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
 * `AuthConfig.otpTransport` by `resolveMailer(cfg)` (T-20). A custom impl can
 * be supplied directly via `AuthConfig.otpMailer` (T-80 wires SendGrid/etc.).
 */
export type OtpMailer = (req: OtpMailerRequest) => Promise<void>;
