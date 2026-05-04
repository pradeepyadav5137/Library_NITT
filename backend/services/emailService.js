import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const sendMail = async (to, subject, text, html) => {
  const fromEmail = process.env.SES_FROM_EMAIL || process.env.NODEMAILER_FROM || 'noreply@nitt.edu';

  const toAddresses = Array.isArray(to) ? to : [to];

  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        ...(html && { Html: { Data: html, Charset: 'UTF-8' } }),
        ...(text && { Text: { Data: text, Charset: 'UTF-8' } }),
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const data = await sesClient.send(command);
    console.log(`Email sent to ${toAddresses.join(', ')} via SES. MessageId: ${data.MessageId}`);
    return data;
  } catch (error) {
    console.error(`Failed to send email to ${toAddresses.join(', ')} via SES:`, error);
    throw error;
  }
};
