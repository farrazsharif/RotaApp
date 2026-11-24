import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is implicit SSL; 587/25 use STARTTLS.
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Fail fast instead of hanging ~2 min if the host is unreachable/blocked.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
  }
  return transporter;
}

// Splits "CareMid <noreply@caremid.co.uk>" into { name, email }.
function parseFrom(): { name: string; email: string } {
  const raw = process.env.SMTP_FROM || 'Caremid <noreply@caremid.co.uk>';
  const m = raw.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
  if (m) return { name: m[1] || 'Caremid', email: m[2] };
  return { name: 'Caremid', email: raw.trim() };
}

// Render blocks outbound SMTP ports (25/465/587), so on the server we send via
// Brevo's HTTPS API (port 443) when BREVO_API_KEY is set. SMTP is kept as a
// fallback for local development.
async function sendViaBrevo(to: string, subject: string, html: string) {
  const from = parseFrom();
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${detail}`);
  }
}

// Returns true if the message was sent (or console-logged in dev), false if a
// configured transport failed — so callers can surface a real delivery failure
// instead of reporting a false success.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.BREVO_API_KEY && !process.env.SMTP_HOST) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return true;
  }
  try {
    if (process.env.BREVO_API_KEY) {
      await sendViaBrevo(to, subject, html);
    } else {
      await getTransporter().sendMail({
        from: process.env.SMTP_FROM || 'Caremid <noreply@caremid.co.uk>',
        to,
        subject,
        html,
      });
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}

// Centred Caremid logo for the top of transactional emails. Email clients
// need an absolute HTTPS URL; LOGO_URL overrides, else it's served from the
// main Caremid web app's public folder.
function emailHeader(): string {
  const logo = process.env.LOGO_URL || `${process.env.CLIENT_URL || 'https://caremid.co.uk'}/logo.png`;
  return `<div style="text-align:center;margin:8px 0 20px"><img src="${logo}" alt="Caremid" style="max-width:200px;height:auto" /></div>`;
}

/**
 * Sent once, when somebody registers a company for a trial.
 *
 * Deliberately a short list of first steps rather than a feature tour. The
 * thing that loses a trial is opening an empty rota and not knowing where to
 * start, and the order below is the one the software actually needs: a client
 * to visit, a carer to send, then a visit joining the two.
 */
export function welcomeEmail(name: string, companyName: string, trialEnds: string, portalUrl: string) {
  return `
    ${emailHeader()}
    <h2>Welcome to Caremid</h2>
    <p>Hi ${name},</p>
    <p><strong>${companyName}</strong> is set up and ready to use. Your free trial runs until <strong>${trialEnds}</strong>, with everything included — no card needed to try it.</p>
    <h3>Three things to do first</h3>
    <ol>
      <li><strong>Add a client.</strong> Service Users &rarr; Add. Name and date of birth are enough to begin.</li>
      <li><strong>Add a carer.</strong> Staff &rarr; Add. Send them an invite and they set their own password.</li>
      <li><strong>Put a visit on the rota.</strong> Schedule &rarr; pick a day, choose the client and the carer, and publish it. Your carer sees it on their phone straight away.</li>
    </ol>
    <p>From there the care plans, risk assessments, medication charts and the CQC checks all build on those three.</p>
    <p><a href="${portalUrl}">Open Caremid</a></p>
    <h3>If you get stuck</h3>
    <p>Reply to this email and a person will answer. If something looks wrong, say what you expected to see — that is usually enough for us to find it.</p>
    <p>The carer app is on the <a href="https://apps.apple.com/gb/app/id6822938462">App Store</a> and <a href="https://play.google.com/store/apps/details?id=uk.co.caremid.carer">Google Play</a>, and also works in a phone browser if your staff would rather not install anything.</p>
  `;
}

/**
 * Sent to whoever runs Caremid when a company registers, so a trial does not
 * sit unnoticed. Everything needed to follow up is in the mail itself —
 * chasing a new sign-up should not start with logging in to look something up.
 */
export function newSignupEmail(fields: {
  companyName: string;
  slug: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  trialEnds: string;
  signedUpAt: string;
  platformUrl: string;
}) {
  return `
    ${emailHeader()}
    <h2>New trial: ${fields.companyName}</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-size:15px">
      <tr><td style="color:#555">Company</td><td><strong>${fields.companyName}</strong></td></tr>
      <tr><td style="color:#555">Contact</td><td>${fields.contactName}</td></tr>
      <tr><td style="color:#555">Email</td><td><a href="mailto:${fields.contactEmail}">${fields.contactEmail}</a></td></tr>
      <tr><td style="color:#555">Phone</td><td>${fields.contactPhone ? `<a href="tel:${fields.contactPhone.replace(/\s+/g, '')}">${fields.contactPhone}</a>` : 'not given'}</td></tr>
      <tr><td style="color:#555">Signed up</td><td>${fields.signedUpAt}</td></tr>
      <tr><td style="color:#555">Trial ends</td><td><strong>${fields.trialEnds}</strong></td></tr>
      <tr><td style="color:#555">Workspace</td><td>${fields.slug}</td></tr>
    </table>
    <p>They have had the welcome email with the three first steps. What they have NOT had is a conversation, and a trial that never gets one usually lapses quietly.</p>
    <p>Worth asking: how many people they look after, how many carers, whether they are moving off paper or off other software, and when their next CQC inspection is due.</p>
    <p><a href="${fields.platformUrl}/platform">Open the platform list</a></p>
  `;
}

export function shiftAssignedEmail(name: string, date: string, start: string, end: string) {
  return `
    <h2>New Shift Assigned</h2>
    <p>Hi ${name},</p>
    <p>You have been assigned a new shift:</p>
    <ul>
      <li><strong>Date:</strong> ${date}</li>
      <li><strong>Time:</strong> ${start} – ${end}</li>
    </ul>
    <p>Please log in to Caremid to view details.</p>
  `;
}

export function setPasswordEmail(name: string, link: string) {
  return `
    ${emailHeader()}
    <h2>Welcome to Caremid</h2>
    <p>Hi ${name},</p>
    <p>An account has been created for you on Caremid. Click the link below to set your own password and get started:</p>
    <p><a href="${link}">Set my password</a></p>
    <p>This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
  `;
}

export function resetPasswordEmail(name: string, link: string) {
  return `
    ${emailHeader()}
    <h2>Reset your Caremid password</h2>
    <p>Hi ${name},</p>
    <p>A password reset was requested for your account. Click the link below to choose a new password:</p>
    <p><a href="${link}">Reset my password</a></p>
    <p>This link expires in 7 days. If you didn't request this, you can ignore this email — your current password still works until you use this link.</p>
  `;
}

export function tradeRequestEmail(requesterName: string, date: string, start: string, end: string) {
  return `
    <h2>Shift Trade Request</h2>
    <p>${requesterName} has requested to trade a shift with you:</p>
    <ul>
      <li><strong>Shift Date:</strong> ${date}</li>
      <li><strong>Time:</strong> ${start} – ${end}</li>
    </ul>
    <p>Please log in to Caremid to accept or reject this request.</p>
  `;
}

export function timeOffDecisionEmail(name: string, status: string, startDate: string, endDate: string) {
  return `
    <h2>Time-Off Request ${status}</h2>
    <p>Hi ${name},</p>
    <p>Your time-off request from <strong>${startDate}</strong> to <strong>${endDate}</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
    <p>Log in to Caremid for more details.</p>
  `;
}
