const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ana.29banana@gmail.com',
    pass: 'uolq cbmh xpkj esjl'
  }
});

async function sendEmail(to, subject, html) {
  return transporter.sendMail({
    from: '"SmartLock System" <ana.29banana@gmail.com>',
    to,
    subject,
    html
  });
}

module.exports = { sendEmail };
