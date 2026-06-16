import nodemailer from "nodemailer";

function createGmailTransporter() {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD");
  }

  return {
    from: gmailUser,
    transporter: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    }),
  };
}

export async function sendMagicLinkEmail(input: {
  to: string;
  magicLink: string;
}) {
  const { from, transporter } = createGmailTransporter();

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "Segreteria Segidio - Link di accesso",
    text: [
      "Segreteria Segidio",
      "",
      "Usa questo link personale per accedere all'applicazione:",
      input.magicLink,
      "",
      "Se non hai richiesto tu questo accesso, ignora questa email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
        <h1 style="font-size: 22px; margin-bottom: 16px;">Segreteria Segidio</h1>
        <p>Usa questo link personale per accedere all'applicazione:</p>
        <p style="margin: 24px 0;">
          <a href="${input.magicLink}" style="background: #1b3272; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Accedi alla Segreteria
          </a>
        </p>
        <p style="font-size: 13px; color: #667085;">Se non hai richiesto tu questo accesso, ignora questa email.</p>
      </div>
    `,
  });
}

export async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
  }>;
}) {
  const { from, transporter } = createGmailTransporter();
  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? undefined,
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: attachment.content,
    })),
  });

  return {
    messageId: typeof info.messageId === "string" ? info.messageId : null,
  };
}
