import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AUTH_COOKIE, AuthService, TOKEN_TTL_SECONDS } from './auth.service';
import { AuthUser, CurrentUser, Public } from './public.decorator';

const password = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(200);

const setupSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password,
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const profileSchema = z.object({ name: z.string().trim().min(1).max(120) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
const forgotSchema = z.object({ email: z.string().trim().email() });
const resetSchema = z.object({ token: z.string().min(10), password });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('setup-status')
  async setupStatus() {
    return { needsSetup: await this.auth.needsSetup() };
  }

  @Public()
  @Post('setup')
  @HttpCode(200)
  async setup(@Body(new ZodPipe(setupSchema)) body: z.infer<typeof setupSchema>, @Res({ passthrough: true }) res: FastifyReply) {
    this.setCookie(res, await this.auth.setup(body));
    return { ok: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Res({ passthrough: true }) res: FastifyReply) {
    this.setCookie(res, await this.auth.login(body.email, body.password));
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(profileSchema)) body: z.infer<typeof profileSchema>) {
    return this.auth.updateProfile(user.id, body.name);
  }

  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body(new ZodPipe(forgotSchema)) body: z.infer<typeof forgotSchema>) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Get('reset-password/:token')
  checkReset(@Param('token') token: string) {
    return this.auth.checkResetToken(token);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(resetSchema)) body: z.infer<typeof resetSchema>, @Res({ passthrough: true }) res: FastifyReply) {
    this.setCookie(res, await this.auth.resetPassword(body.token, body.password));
    return { ok: true };
  }

  private setCookie(res: FastifyReply, token: string) {
    res.setCookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS,
    });
  }
}
