import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Me, NodeDetail, OpenProposal, ProposalRow, Space, TreeItem, UserRow, VersionRow } from './types';

export const qk = {
  me: ['me'] as const,
  spaces: ['spaces'] as const,
  space: (slug: string) => ['space', slug] as const,
  tree: (spaceId: string) => ['tree', spaceId] as const,
  node: (id: string) => ['node', id] as const,
  versions: (id: string) => ['versions', id] as const,
  proposals: (id: string) => ['proposals', id] as const,
  openProposals: ['open-proposals'] as const,
  users: ['users'] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.get<Me>('/auth/me'), retry: false });
export const useSpaces = () => useQuery({ queryKey: qk.spaces, queryFn: () => api.get<Space[]>('/spaces') });
export const useSpace = (slug: string) =>
  useQuery({ queryKey: qk.space(slug), queryFn: () => api.get<Space>(`/spaces/by-slug/${slug}`) });
export const useTree = (spaceId?: string) =>
  useQuery({
    queryKey: qk.tree(spaceId ?? ''),
    queryFn: () => api.get<TreeItem[]>(`/spaces/${spaceId}/tree`),
    enabled: !!spaceId,
  });
export const useNode = (id: string) => useQuery({ queryKey: qk.node(id), queryFn: () => api.get<NodeDetail>(`/nodes/${id}`) });
export const useVersions = (id: string) =>
  useQuery({ queryKey: qk.versions(id), queryFn: () => api.get<VersionRow[]>(`/nodes/${id}/versions`) });
export const useProposals = (id: string) =>
  useQuery({ queryKey: qk.proposals(id), queryFn: () => api.get<ProposalRow[]>(`/nodes/${id}/change-requests`) });
export const useOpenProposals = () =>
  useQuery({ queryKey: qk.openProposals, queryFn: () => api.get<OpenProposal[]>('/change-requests'), refetchInterval: 60_000 });
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: () => api.get<UserRow[]>('/users') });

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { spaceId: string; parentId?: string | null; title?: string; content?: unknown; status?: string; sourceFileId?: string }) =>
      api.post<TreeItem>('/nodes', input),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: qk.tree(v.spaceId) });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useDeleteNode(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/nodes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tree(spaceId) });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useMoveNode(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; parentId: string | null; position: number }) =>
      api.post(`/nodes/${v.id}/move`, { parentId: v.parentId, position: v.position }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.tree(spaceId) });
      const prev = qc.getQueryData<TreeItem[]>(qk.tree(spaceId));
      qc.setQueryData<TreeItem[]>(qk.tree(spaceId), (old) =>
        old?.map((n) => (n.id === v.id ? { ...n, parent_id: v.parentId, position: v.position } : n)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.tree(spaceId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tree(spaceId) }),
  });
}

/** Upload de arquivo (multipart). */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`/api${path}`, { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : `Erro ${res.status}`);
  return data as T;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
