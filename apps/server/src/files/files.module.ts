import { BadRequestException, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { extname } from 'node:path';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { FilesService } from './files.service';
import { convertFile, SUPPORTED_EXTENSIONS } from './converters';
import { isOfficeFile, OFFICE_EXTENSIONS } from './preview';

const MAX_IMAGE = 15 * 1024 * 1024;

async function readUpload(req: FastifyRequest) {
  const part = await (req as any).file();
  if (!part) throw new BadRequestException('Nenhum arquivo enviado');
  const data: Buffer = await part.toBuffer();
  // Navegadores enviam o nome em UTF-8, mas o parser o lê como latin1.
  let name: string = part.filename || 'arquivo';
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    if (!fixed.includes('�')) name = fixed;
  } catch {
    /* mantém o nome original */
  }
  return { name, mime: part.mimetype as string, data };
}

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Upload de imagens coladas/inseridas no editor. */
  @Post('files')
  @MinRole('editor')
  async upload(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { name, mime, data } = await readUpload(req);
    if (!mime.startsWith('image/')) throw new BadRequestException('Envie uma imagem');
    if (data.length > MAX_IMAGE) throw new BadRequestException('Imagem maior que 15 MB');
    const file = await this.files.save({ workspaceId: user.workspaceId, userId: user.id, name, mime, data, kind: 'image' });
    return { ...file, url: `/api/files/${file.id}` };
  }

  @Get('files/:id')
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('download') dl: string | undefined, @Res() res: FastifyReply) {
    const { file, data } = await this.files.read(user.workspaceId, id);
    const isPdf = file.mime === 'application/pdf';
    const inline = !dl && (file.mime.startsWith('image/') || isPdf);
    res
      .header('Content-Type', file.mime)
      .header('Content-Length', data.length)
      .header('Cache-Control', 'private, max-age=86400')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    // O visualizador de PDF do navegador não funciona com CSP restritiva; os demais tipos ficam bloqueados.
    if (!isPdf) res.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.send(data);
  }

  /** Gera (ou devolve) o PDF fiel ao layout de um arquivo do Office já importado. */
  @Post('files/:id/preview')
  @MinRole('editor')
  @HttpCode(200)
  async preview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const previewId = await this.files.ensurePreview(user.workspaceId, user.id, id);
    if (!previewId) {
      throw new BadRequestException('Não foi possível gerar a visualização. Verifique se o serviço Gotenberg está rodando (docker compose up -d gotenberg).');
    }
    return { previewFileId: previewId };
  }

  @Get('import/formats')
  formats() {
    return { extensions: [...new Set([...SUPPORTED_EXTENSIONS, ...OFFICE_EXTENSIONS])] };
  }

  /**
   * Converte um arquivo antigo em HTML para pré-visualização.
   * O original é sempre guardado (vira anexo da página criada).
   */
  @Post('import/convert')
  @MinRole('editor')
  async convert(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { name, mime, data } = await readUpload(req);
    const original = await this.files.save({ workspaceId: user.workspaceId, userId: user.id, name, mime, data, kind: 'original' });
    const saveImage = async (imgName: string, imgMime: string, buf: Buffer) => {
      const f = await this.files.save({ workspaceId: user.workspaceId, userId: user.id, name: imgName, mime: imgMime, data: buf, kind: 'image' });
      return `/api/files/${f.id}`;
    };
    // Arquivos do Office ganham um PDF com o layout original (para "ver exatamente como era").
    const previewPdf = isOfficeFile(name) ? await this.files.attachPreview(user.workspaceId, user.id, original.id, name, data) : null;
    try {
      let result = await convertFile(name, mime, data, saveImage);
      // Formatos legados (.doc, .ppt, .xls, .odt, .rtf…): extrai o texto do PDF gerado.
      if (!result.supported && previewPdf) {
        const viaPdf = await convertFile('documento.pdf', 'application/pdf', previewPdf, saveImage);
        result = { ...viaPdf, format: result.format, warnings: ['Texto extraído do documento convertido; o layout original está na aba "Original".'] };
      }
      if (isOfficeFile(name) && !previewPdf) {
        result.warnings.push('Visualização fiel ao original indisponível: o serviço Gotenberg não está rodando (docker compose up -d gotenberg).');
      }
      const fallbackTitle = name.slice(0, name.length - extname(name).length).replace(/[_]+/g, ' ').trim();
      return { fileId: original.id, fileName: name, size: data.length, hasPreview: !!previewPdf, ...result, title: result.title || fallbackTitle };
    } catch (e) {
      return {
        fileId: original.id,
        fileName: name,
        size: data.length,
        html: `<p>Não foi possível converter <strong>${name.replace(/</g, '&lt;')}</strong>. O arquivo original está anexado a esta página.</p>`,
        title: name,
        format: extname(name).slice(1).toUpperCase(),
        supported: false,
        warnings: [`Falha na conversão: ${(e as Error).message}`],
      };
    }
  }
}

@Module({ controllers: [FilesController], providers: [FilesService], exports: [FilesService] })
export class FilesModule {}
