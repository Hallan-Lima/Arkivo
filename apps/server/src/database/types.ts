import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export type UserRole = 'admin' | 'editor' | 'viewer';
export type NodeType = 'page' | 'process' | 'diagram' | 'board' | 'sql' | 'data_table';
export type NodeStatus = 'draft' | 'in_review' | 'published' | 'outdated';

export interface WorkspacesTable {
  id: Generated<string>;
  name: string;
  created_at: Timestamp;
}

export interface UsersTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  active: Generated<boolean>;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SpacesTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface NodesTable {
  id: Generated<string>;
  space_id: string;
  parent_id: string | null;
  type: Generated<NodeType>;
  title: string;
  icon: string | null;
  content: ColumnType<unknown, string | null, string | null>;
  text_content: string | null;
  position: number;
  status: Generated<NodeStatus>;
  owner_id: string | null;
  review_due_at: Timestamp | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  ai_usage: Generated<AiUsage>;
  indexed_at: Timestamp | null;
  design_id: string | null;
}

/** auto = entra na busca normalmente; always = fonte de referência (prioridade); never = a IA ignora. */
export type AiUsage = 'auto' | 'always' | 'never';

export interface NodeVersionsTable {
  id: Generated<string>;
  node_id: string;
  version: number;
  title: string;
  content: ColumnType<unknown, string | null, string | null>;
  text_content: string | null;
  message: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DB {
  workspaces: WorkspacesTable;
  users: UsersTable;
  spaces: SpacesTable;
  nodes: NodesTable;
  node_versions: NodeVersionsTable;
  password_resets: PasswordResetsTable;
  settings: SettingsTable;
  api_tokens: ApiTokensTable;
  change_requests: ChangeRequestsTable;
  files: FilesTable;
  node_chunks: NodeChunksTable;
  node_sources: NodeSourcesTable;
  doc_designs: DocDesignsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Space = Selectable<SpacesTable>;
export type Node = Selectable<NodesTable>;
export type NodeUpdate = Updateable<NodesTable>;

// ---- Migração 002 ----
export interface PasswordResetsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SettingsTable {
  workspace_id: string;
  key: string;
  value: ColumnType<unknown, string, string>;
  updated_at: Timestamp;
}

export interface ApiTokensTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  name: string;
  prefix: string;
  token_hash: string;
  can_write: Generated<boolean>;
  last_used_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export type ChangeRequestStatus = 'open' | 'accepted' | 'rejected';
export type ChangeRequestSource = 'ai' | 'mcp' | 'user';

export interface ChangeRequestsTable {
  id: Generated<string>;
  node_id: string;
  base_version: number | null;
  summary: string;
  instruction: string | null;
  proposed_title: string | null;
  proposed_markdown: string;
  source: ChangeRequestSource;
  author_id: string | null;
  author_label: string | null;
  status: Generated<ChangeRequestStatus>;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
}

export interface FilesTable {
  id: Generated<string>;
  workspace_id: string;
  node_id: string | null;
  kind: 'original' | 'image' | 'attachment' | 'preview';
  name: string;
  mime: string;
  size: number;
  storage_key: string;
  preview_file_id: string | null;
  created_by: string | null;
  created_at: Timestamp;
}

// ---- Migração 004 (notebook de IA e designs) ----
export interface NodeChunksTable {
  id: Generated<string>;
  node_id: string;
  workspace_id: string;
  idx: number;
  heading: string | null;
  content: string;
  version: number;
  /** pgvector; gravado via SQL bruto (`'[...]'::vector`). */
  embedding: string | null;
  embedding_model: string | null;
  created_at: Timestamp;
}

export interface NodeSourcesTable {
  node_id: string;
  source_node_id: string;
  source_version: number;
  created_at: Timestamp;
}

export interface DocDesignPalette {
  primary: string;
  accent: string;
  text: string;
  background: string;
  heading: string;
  muted: string;
}

export interface DocDesignsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  palette: ColumnType<DocDesignPalette, string, string>;
  font_heading: string;
  font_body: string;
  layout: string;
  header_text: string | null;
  footer_text: string | null;
  logo_file_id: string | null;
  cover_file_id: string | null;
  guidelines: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
