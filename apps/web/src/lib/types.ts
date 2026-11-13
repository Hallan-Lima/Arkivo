export type UserRole = 'admin' | 'editor' | 'viewer';
export type NodeType = 'page' | 'process' | 'diagram' | 'board' | 'sql' | 'data_table';
export type NodeStatus = 'draft' | 'in_review' | 'published' | 'outdated';
/** auto = entra na busca; always = fonte de referência (prioridade); never = a IA ignora. */
export type AiUsage = 'auto' | 'always' | 'never';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  workspaceId: string;
  workspaceName: string;
  features: { ai: boolean; aiProposals: boolean; email: boolean };
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  nodeCount?: number;
}

export interface TreeItem {
  id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  icon: string | null;
  position: number;
  status: NodeStatus;
  ai_usage: AiUsage;
}

export interface TreeNode extends TreeItem {
  children: TreeNode[];
}

export interface FileRow {
  id: string;
  name: string;
  kind: 'original' | 'image' | 'attachment' | 'preview';
  mime: string;
  size: number;
  preview_file_id: string | null;
  created_at: string;
}

export interface NodeDetail {
  id: string;
  space_id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  icon: string | null;
  content: Record<string, unknown>;
  status: NodeStatus;
  owner_id: string | null;
  owner_name: string | null;
  review_due_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by_name: string | null;
  space_slug: string;
  space_name: string;
  version: number;
  open_proposals: number;
  files: FileRow[];
  ai_usage: AiUsage;
  design_id: string | null;
  derived_from: { id: string; title: string; space_slug: string; source_version: number; current_version: number }[];
}

export interface VersionRow {
  version: number;
  title: string;
  message: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
}

export interface VersionDetail extends VersionRow {
  content: Record<string, unknown>;
  text_content: string | null;
}

export interface SearchHit {
  id: string;
  title: string;
  type: NodeType;
  status: NodeStatus;
  space_name: string;
  space_slug: string;
  snippet: string;
  updated_at: string;
}

export type ProposalSource = 'ai' | 'mcp' | 'user';
export type ProposalStatus = 'open' | 'accepted' | 'rejected';

export interface ProposalRow {
  id: string;
  summary: string;
  source: ProposalSource;
  status: ProposalStatus;
  author_label: string | null;
  author_name: string | null;
  resolver_name: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ProposalDetail {
  id: string;
  node_id: string;
  node_title: string;
  summary: string;
  instruction: string | null;
  proposed_title: string | null;
  proposed_markdown: string;
  current_markdown: string;
  source: ProposalSource;
  status: ProposalStatus;
  author_label: string | null;
  base_version: number | null;
  current_version: number;
  created_at: string;
}

export interface OpenProposal {
  id: string;
  summary: string;
  source: ProposalSource;
  author_label: string | null;
  created_at: string;
  node_id: string;
  node_title: string;
  space_slug: string;
  space_name: string;
}

/** Fonte numerada de uma resposta/geração da IA. */
export interface ChatSource {
  n: number;
  nodeId: string;
  title: string;
  spaceSlug: string;
  spaceName: string;
  heading: string | null;
  excerpt: string;
  version: number;
  status: NodeStatus;
  aiUsage: AiUsage;
  kind: 'doc' | 'chunk';
}

export interface Scope {
  spaces: Record<string, boolean>;
  nodes: Record<string, boolean>;
}

export type StudioKind = 'summary' | 'briefing' | 'faq' | 'study_guide' | 'timeline' | 'mindmap' | 'report' | 'new_doc';

export interface StudioResult {
  id: string;
  kind: StudioKind;
  label: string;
  title: string;
  markdown: string;
  sources: ChatSource[];
  createdAt: string;
  designId?: string | null;
}

export interface AuditFinding {
  id: string;
  type: 'contradiction' | 'source_changed' | 'review_overdue' | 'stale' | 'marked_outdated';
  severity: 'high' | 'medium' | 'low';
  nodeId: string;
  title: string;
  spaceSlug: string;
  detail: string;
  suggestion?: string;
  related?: { nodeId: string; title: string; spaceSlug: string };
}

export interface AuditResult {
  findings: AuditFinding[];
  checkedDocs: number;
  deep: boolean;
  scopeDocs: number;
}

export type DesignFont = 'sans' | 'serif' | 'mono' | 'humanist' | 'geometric' | 'slab';
export type DesignLayout = 'standard' | 'report' | 'compact' | 'wide' | 'letter';
export interface DesignPalette {
  primary: string;
  accent: string;
  text: string;
  background: string;
  heading: string;
  muted: string;
}
export interface Design {
  id: string;
  name: string;
  description: string | null;
  palette: DesignPalette;
  font_heading: DesignFont;
  font_body: DesignFont;
  layout: DesignLayout;
  header_text: string | null;
  footer_text: string | null;
  logo_file_id: string | null;
  cover_file_id: string | null;
  guidelines: string | null;
  usage?: number;
  created_at: string;
  updated_at: string;
}

export const AI_USAGE_LABEL: Record<AiUsage, string> = {
  auto: 'Automático',
  always: 'Fonte de referência',
  never: 'Nunca usar na IA',
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  published: 'Publicado',
  outdated: 'Desatualizado',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Leitor',
};

export const SOURCE_LABEL: Record<ProposalSource, string> = {
  ai: 'IA',
  mcp: 'Integração (MCP)',
  user: 'Usuário',
};
