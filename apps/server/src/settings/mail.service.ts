import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SettingsService } from './settings.service';

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  constructor(private readonly settings: SettingsService) {}

  async isConfigured(workspaceId: string) {
    const s = await this.settings.getSmtp(workspaceId);
    return s.enabled && !!s.host && !!s.from;
  }

  async send(workspaceId: string, to: string, subject: string, text: string, html?: string) {
    const s = await this.settings.getSmtp(workspaceId);
    if (!s.enabled || !s.host) throw new BadRequestException('E-mail (SMTP) não configurado');
    const transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.password } : undefined,
    });
    await transport.sendMail({ from: s.from, to, subject, text, html });
    this.log.log(`E-mail "${subject}" enviado para ${to}`);
  }
}

export function emailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${cta.label}</a></p>
       <p style="color:#71717a;font-size:12px">Se o botão não funcionar, copie este endereço: ${cta.url}</p>`
    : '';
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#18181b">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px">Arkivo</div>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="line-height:1.6;color:#3f3f46">${body}</p>${button}</div>`;
}
