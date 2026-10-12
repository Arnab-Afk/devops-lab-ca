const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

async function sendCode(email, name, code) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USERNAME,
    to: email,
    subject: `Your chat login code: ${code}`,
    text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 10 minutes.\n`,
    html: `<p>Hi ${name},</p><p>Your verification code is <b style="font-size:20px">${code}</b>.</p><p>It expires in 10 minutes.</p>`,
  });
}

module.exports = { sendCode };
