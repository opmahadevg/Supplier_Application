import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
// NOTE: Resend requires a verified domain to send to external addresses.
// Once proquoment.in is verified at resend.com/domains:
//   - Change FROM_EMAIL to: notifications@proquoment.in
//   - Change ADMIN_EMAIL to: adminproquoment@gmail.com
const ADMIN_EMAIL    = "proquoment@gmail.com"; // TODO: change to adminproquoment@gmail.com after domain verification
const FROM_EMAIL     = "onboarding@resend.dev"; // TODO: change to notifications@proquoment.in after domain verification

serve(async (req) => {
  // Supabase DB Webhook sends a POST with the record payload
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Supabase webhook payload: { type, table, record, old_record, schema }
  const record = (body.record ?? body) as Record<string, unknown>;

  const name    = record.primary_contact_name ?? "\u2014";
  const company = record.factory_name         ?? "\u2014";
  const email   = record.email_primary        ?? "\u2014";
  const country = record.country              ?? "\u2014";
  const status  = record.status               ?? "pending";
  const submittedAt = record.created_at
    ? new Date(record.created_at as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:32px 0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e7;">
    <div style="background:#0066CC;padding:24px 32px;">
      <div style="font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.01em;">
        <span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%;margin-right:8px;"></span>
        Proquoment
      </div>
    </div>
    <div style="padding:32px;">
      <h2 style="font-size:20px;color:#111;margin:0 0 8px;">&#x1F195; New Supplier Application</h2>
      <p style="font-size:14px;color:#666;margin:0 0 24px;">A new supplier has submitted an application on <strong>proquoment.in</strong>.</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#888;width:40%;">Contact Name</td>
          <td style="padding:10px 0;color:#111;font-weight:600;">${name}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#888;">Company / Factory</td>
          <td style="padding:10px 0;color:#111;font-weight:600;">${company}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#888;">Email</td>
          <td style="padding:10px 0;color:#0066CC;">${email}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#888;">Country</td>
          <td style="padding:10px 0;color:#111;">${country}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#888;">Status</td>
          <td style="padding:10px 0;"><span style="background:#fff7ed;color:#c2410c;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">${status}</span></td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#888;">Submitted At</td>
          <td style="padding:10px 0;color:#111;">${submittedAt} IST</td>
        </tr>
      </table>

      <div style="margin-top:28px;">
        <a href="https://supabase.com/dashboard/project/qgyefzlanqkqzlgneyge/editor"
           style="display:inline-block;background:#0066CC;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">
          View in Supabase &#x2192;
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9f9f9;font-size:12px;color:#bbb;text-align:center;">
      Proquoment Admin Notifications &middot; proquoment.in
    </div>
  </div>
</body>
</html>
`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to:   [ADMIN_EMAIL],
      subject: `[Proquoment] New Supplier Application \u2014 ${company} (${country})`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(err, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
