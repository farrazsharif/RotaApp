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
  const raw = process.env.SMTP_FROM || 'RotaApp <noreply@rotaapp.com>';
  const m = raw.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
  if (m) return { name: m[1] || 'RotaApp', email: m[2] };
  return { name: 'RotaApp', email: raw.trim() };
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

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.BREVO_API_KEY && !process.env.SMTP_HOST) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    if (process.env.BREVO_API_KEY) {
      await sendViaBrevo(to, subject, html);
    } else {
      await getTransporter().sendMail({
        from: process.env.SMTP_FROM || 'RotaApp <noreply@rotaapp.com>',
        to,
        subject,
        html,
      });
    }
  } catch (err) {
    console.error('Email send failed:', err);
  }
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
    <p>Please log in to RotaApp to view details.</p>
  `;
}

export function setPasswordEmail(name: string, link: string) {
  return `
    <h2>Welcome to RotaApp</h2>
    <p>Hi ${name},</p>
    <p>An account has been created for you on RotaApp. Click the link below to set your own password and get started:</p>
    <p><a href="${link}">Set my password</a></p>
    <p>This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
  `;
}

export function resetPasswordEmail(name: string, link: string) {
  return `
    <h2>Reset your RotaApp password</h2>
    <p>Hi ${name},</p>
    <p>An administrator has requested a password reset for your account. Click the link below to choose a new password:</p>
    <p><a href="${link}">Reset my password</a></p>
    <p>This link expires in 7 days. If you didn't expect this, contact your manager — your current password still works until you use this link.</p>
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
    <p>Please log in to RotaApp to accept or reject this request.</p>
  `;
}

export function timeOffDecisionEmail(name: string, status: string, startDate: string, endDate: string) {
  return `
    <h2>Time-Off Request ${status}</h2>
    <p>Hi ${name},</p>
    <p>Your time-off request from <strong>${startDate}</strong> to <strong>${endDate}</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
    <p>Log in to RotaApp for more details.</p>
  `;
}
