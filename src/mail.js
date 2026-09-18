const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendEmail(to, subject, html, attachmentUrl = null) {
  const mailOptions = {
    from: `"SmartLock System" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  };

  if (attachmentUrl) {
    mailOptions.attachments = [
      {
        filename: 'qr-code.png',
        path: attachmentUrl
      }
    ];
  }

  return transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };
