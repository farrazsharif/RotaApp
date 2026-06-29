import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'RotaApp <noreply@rotaapp.com>',
      to,
      subject,
      html,
    });
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
