import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordReset(to: string, userName: string, resetUrl: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? 'Gas ERP <onboarding@resend.dev>';

    const subject = 'Redefinição de senha — Gas ERP';
    const html = `
      <p>Olá, ${userName}.</p>
      <p>Recebemos uma solicitação para redefinir sua senha no Gas ERP.</p>
      <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
      <p>O link expira em 1 hora. Se você não solicitou, ignore este e-mail.</p>
    `;

    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY ausente — link de reset para ${to}: ${resetUrl}`);
      return false;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Falha ao enviar e-mail para ${to}: ${body}`);
      return false;
    }

    return true;
  }
}
