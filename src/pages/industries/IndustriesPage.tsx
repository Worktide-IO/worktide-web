import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Building, Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { IndustryJsonld } from '@/lib/industry';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TranslationsFields, type TranslationsMap } from '@/components/TranslationsFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Manage the workspace's industry ("Branchen") vocabulary — add, rename,
 * archive/reactivate. Customers pick from this list (with type-ahead) in the
 * customer form. Archived entries stay on existing customers but drop out of
 * the picker.
 */
export function IndustriesPage() {
  const { t } = useTranslation();
  const { result, query } = useList<Row<IndustryJsonld>>({
    resource: 'industries',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const { languages } = useSupportedLanguages();
  const localize = useLocalize();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<
    { id: string; name: string; translations: TranslationsMap } | null
  >(null);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const rows = result?.data ?? [];

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await api.post('/industries', { name: n, workspace: workspaceIri });
      toast.success(t('toast.created_named_dq', { name: n }));
      setName('');
      await query.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { status?: number } })?.response?.status === 422
          ? t('industries.err_duplicate')
          : t('industries.err_create');
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
    try {
      await api.patch(`/industries/${id}`, body, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      toast.success(ok);
      await query.refetch();
    } catch {
      toast.error(t('toast.action_failed'));
    }
  };

  const saveRename = async () => {
    if (!rename) return;
    const n = rename.name.trim();
    if (!n) return;
    setBusy(true);
    await patch(rename.id, { name: n, translations: rename.translations }, t('industries.toast_saved'));
    setRename(null);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <Building className="size-6 text-muted-foreground" /> {t('industries.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('industries.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('industries.new_heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder={t('industries.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
              }}
              className="max-w-sm"
            />
            <Button type="button" onClick={add} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t('action.add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('industries.count', { count: rows.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('industries.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('industries.col_name')}</TableHead>
                  <TableHead className="w-28">{t('industries.col_status')}</TableHead>
                  <TableHead className="w-56 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <TableRow key={i['@id']} className={i.isArchived ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{localize(i, 'name')}</TableCell>
                    <TableCell>
                      {i.isArchived ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t('industries.status_archived')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('industries.status_active')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            i.id &&
                            setRename({
                              id: i.id,
                              name: i.name,
                              translations:
                                (i as unknown as { translations?: TranslationsMap }).translations ?? {},
                            })
                          }
                        >
                          <Pencil className="size-3" /> {t('action.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            i.id &&
                            patch(
                              i.id,
                              { isArchived: !i.isArchived },
                              i.isArchived ? t('industries.toast_reactivated') : t('industries.toast_archived'),
                            )
                          }
                        >
                          {i.isArchived ? (
                            <>
                              <ArchiveRestore className="size-3" /> {t('industries.reactivate')}
                            </>
                          ) : (
                            <>
                              <Archive className="size-3" /> {t('industries.archive')}
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={rename !== null} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('industries.edit_title')}</DialogTitle>
          </DialogHeader>
          {rename ? (
            <div className="space-y-3">
              <Input
                value={rename.name}
                onChange={(e) => setRename({ ...rename, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveRename();
                }}
              />
              <TranslationsFields
                fields={[{ key: 'name', label: t('industries.col_name') }]}
                locales={languages}
                value={rename.translations}
                onChange={(translations) => setRename({ ...rename, translations })}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRename(null)} disabled={busy}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={saveRename} disabled={busy}>
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
