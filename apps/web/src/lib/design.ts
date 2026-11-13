import type { CSSProperties } from 'react';
import type { Design, DesignFont, DesignLayout, DesignPalette } from './types';

/** Só fontes do sistema/já carregadas: nenhum documento depende de serviço externo. */
export const FONT_STACKS: Record<DesignFont, { label: string; stack: string }> = {
  sans: { label: 'Sem serifa (Inter)', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: 'Serifada (Georgia)', stack: "Georgia, Cambria, 'Times New Roman', serif" },
  humanist: { label: 'Humanista', stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
  geometric: { label: 'Geométrica', stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
  slab: { label: 'Slab', stack: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif" },
  mono: { label: 'Monoespaçada', stack: "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, monospace" },
};

export const LAYOUTS: Record<DesignLayout, { label: string; desc: string }> = {
  standard: { label: 'Padrão', desc: 'Página única, largura de leitura confortável.' },
  report: { label: 'Relatório', desc: 'Capa com faixa colorida e seções numeradas (1., 1.1).' },
  letter: { label: 'Carta / Ofício', desc: 'Papel timbrado: logo e cabeçalho no topo, rodapé fixo.' },
  compact: { label: 'Compacto', desc: 'Texto menor e mais denso, bom para procedimentos longos.' },
  wide: { label: 'Largo', desc: 'Mais largura para tabelas e diagramas.' },
};

export const PALETTE_PRESETS: { name: string; palette: DesignPalette }[] = [
  { name: 'Índigo', palette: { primary: '#4f46e5', accent: '#0ea5e9', text: '#1f2937', background: '#ffffff', heading: '#111827', muted: '#6b7280' } },
  { name: 'Corporativo', palette: { primary: '#0f4c81', accent: '#f2a900', text: '#22303c', background: '#ffffff', heading: '#0b2545', muted: '#5f6b7a' } },
  { name: 'Floresta', palette: { primary: '#166534', accent: '#ca8a04', text: '#1c2a21', background: '#fbfdf9', heading: '#14532d', muted: '#5b6b60' } },
  { name: 'Vinho', palette: { primary: '#9f1239', accent: '#b45309', text: '#2b1d21', background: '#fffdfb', heading: '#4c0519', muted: '#7c6a6e' } },
  { name: 'Grafite', palette: { primary: '#334155', accent: '#e11d48', text: '#1e293b', background: '#ffffff', heading: '#0f172a', muted: '#64748b' } },
  { name: 'Areia', palette: { primary: '#9a5b13', accent: '#0f766e', text: '#3b2f22', background: '#fffaf0', heading: '#3b2a14', muted: '#857560' } },
];

export const fileUrl = (id: string | null | undefined) => (id ? `/api/files/${id}` : null);

/** Variáveis CSS aplicadas no wrapper `.doc-design`. */
export function designStyle(d: Pick<Design, 'palette' | 'font_heading' | 'font_body'>): CSSProperties {
  return {
    '--d-primary': d.palette.primary,
    '--d-accent': d.palette.accent,
    '--d-text': d.palette.text,
    '--d-bg': d.palette.background,
    '--d-heading': d.palette.heading,
    '--d-muted': d.palette.muted,
    '--d-font-heading': FONT_STACKS[d.font_heading]?.stack,
    '--d-font-body': FONT_STACKS[d.font_body]?.stack,
  } as CSSProperties;
}

export const layoutWidth = (l: DesignLayout | undefined) => (l === 'wide' ? 'max-w-5xl' : l === 'letter' ? 'max-w-[52rem]' : 'max-w-3xl');
