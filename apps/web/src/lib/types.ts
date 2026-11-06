export type UserRole = 'admin' | 'editor' | 'viewer';
export type NodeType = 'page' | 'process' | 'diagram' | 'board' | 'sql' | 'data_table';
export type NodeStatus = 'draft' | 'in_review' | 'published' | 'outdated';

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

export interface ChatSource {
  id: string;
  title: string;
  space_slug: string;
  space_name: string;
}

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
