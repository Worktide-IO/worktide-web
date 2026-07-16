import { api } from '@/lib/api';

/**
 * Client for the Nextcloud-like customer file tree (folders + files) and the
 * per-customer project-progress aggregate. These are hand-authored (custom
 * controllers + polymorphic File/Folder resources; see the gen:api note in
 * worktide-web-genapi-broken). All calls are workspace-scoped by the axios
 * interceptor (X-Workspace-Id header).
 *
 * IMPORTANT: the `folder`/`parent` filters are Doctrine associations — the API
 * matches them by IRI, NOT by raw UUID. Always pass folder IRIs here.
 */

const TARGET = 'customer';

export type FolderNode = {
  '@id': string;
  id: string;
  name: string;
  parent: string | null;
  isHiddenForConnectUsers?: boolean;
};

export type FileNode = {
  '@id': string;
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  folder?: string | null;
  isHiddenForConnectUsers?: boolean;
};

export type ProjectProgress = { total: number; closed: number; percent: number };

type Collection<T> = { member?: T[]; 'hydra:member'?: T[] };

function members<T>(data: Collection<T>): T[] {
  return data.member ?? data['hydra:member'] ?? [];
}

/** Folders directly under `parentIri` (null = the customer's root). */
export async function listFolders(customerId: string, parentIri: string | null): Promise<FolderNode[]> {
  const params: Record<string, string> = {
    target: TARGET,
    targetId: customerId,
    'order[name]': 'asc',
    itemsPerPage: '200',
  };
  if (parentIri) {
    params.parent = parentIri;
  } else {
    params['exists[parent]'] = 'false';
  }
  const { data } = await api.get<Collection<FolderNode>>('/folders', { params });
  return members(data);
}

/** Files directly in `folderIri` (null = the customer's root). */
export async function listFiles(customerId: string, folderIri: string | null): Promise<FileNode[]> {
  const params: Record<string, string> = {
    target: TARGET,
    targetId: customerId,
    'order[name]': 'asc',
    itemsPerPage: '200',
  };
  if (folderIri) {
    params.folder = folderIri;
  } else {
    params['exists[folder]'] = 'false';
  }
  const { data } = await api.get<Collection<FileNode>>('/files', { params });
  return members(data);
}

export async function createFolder(
  customerId: string,
  workspaceIri: string,
  name: string,
  parentIri: string | null,
): Promise<FolderNode> {
  const { data } = await api.post<FolderNode>(
    '/folders',
    { name, target: TARGET, targetId: customerId, workspace: workspaceIri, parent: parentIri },
    { headers: { 'Content-Type': 'application/ld+json' } },
  );
  return data;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  await api.patch(`/folders/${folderId}`, { name }, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
}

/** Recursive soft-delete of the folder + its whole subtree (custom endpoint). */
export async function deleteFolder(folderId: string): Promise<void> {
  await api.delete(`/folders/${folderId}`);
}

export async function uploadFile(
  customerId: string,
  folderIri: string | null,
  file: File,
): Promise<FileNode> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('target', TARGET);
  fd.append('targetId', customerId);
  if (folderIri) {
    fd.append('folder', folderIri);
  }
  const { data } = await api.post<FileNode>('/files', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

/** Move a file into a folder (null = the target's root). */
export async function moveFile(fileId: string, folderIri: string | null): Promise<void> {
  await api.patch(`/files/${fileId}`, { folder: folderIri }, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
}

/** Move a folder under a new parent (null = the target's root). */
export async function moveFolder(folderId: string, parentIri: string | null): Promise<void> {
  await api.patch(`/folders/${folderId}`, { parent: parentIri }, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
}

/** Toggle portal visibility for a folder or file. */
export async function setHidden(kind: 'folders' | 'files', id: string, hidden: boolean): Promise<void> {
  await api.patch(`/${kind}/${id}`, { isHiddenForConnectUsers: hidden }, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
}

/** True for files we can render inline as an image (thumbnail + lightbox). */
export function isImage(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

export type FileKind = 'image' | 'audio' | 'video' | 'pdf' | 'other';

/**
 * How a file should be opened from the file manager:
 * - image/audio/video → previewable inline in the media viewer
 * - pdf → open in a new browser tab
 * - other → download
 */
export function fileKind(mimeType: string | null | undefined): FileKind {
  if (isImage(mimeType)) return 'image';
  if (typeof mimeType === 'string') {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
  }
  return 'other';
}

/** Kinds shown inside the media viewer (with next/prev navigation). */
export function isViewable(mimeType: string | null | undefined): boolean {
  const k = fileKind(mimeType);
  return k === 'image' || k === 'audio' || k === 'video';
}

/**
 * Fetch a file's raw bytes as an object URL through the authenticated client
 * (a plain <img src> would not carry the JWT). There is no server-side
 * thumbnail endpoint, so the full image is loaded once and the same URL is
 * reused for both the list thumbnail and the lightbox. The caller owns the
 * returned URL and must `URL.revokeObjectURL` it when done.
 */
export async function fetchFileObjectUrl(fileId: string): Promise<string> {
  const { data } = await api.get<Blob>(`/files/${fileId}/content`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

/**
 * Download a file through the authenticated axios client (a plain <a href> would
 * not carry the JWT), then trigger a browser save.
 */
export async function downloadFile(fileId: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(`/files/${fileId}/content`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Task-completion progress per project of a customer, keyed by project IRI. */
export async function fetchProjectProgress(customerId: string): Promise<Record<string, ProjectProgress>> {
  const { data } = await api.get<{ progress?: Record<string, ProjectProgress> }>(
    '/reports/project-progress',
    { params: { customer: customerId } },
  );
  return data.progress ?? {};
}
