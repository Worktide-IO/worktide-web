import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MinusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import {
  api,
  setAccessToken,
  writeAuth,
  WORKSPACE_STORAGE_KEY,
} from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Check = { ok?: boolean; skipped?: boolean; error?: string; reason?: string };
type HealthResponse = {
  database: Check;
  storage: Check;
  search: Check;
  mercure: Check;
};

const CHECK_LABELS: Record<keyof HealthResponse, string> = {
  database: 'setup_check.database',
  storage: 'setup_check.storage',
  search: 'setup_check.search',
  mercure: 'setup_check.mercure',
};

const formSchema = z
  .object({
    firstName: z.string().max(100).optional(),
    email: z.string().email('Bitte gültige Email-Adresse eingeben'),
    password: z.string().min(8, 'Mindestens 8 Zeichen'),
    password2: z.string(),
    workspaceName: z.string().min(1, 'Workspace-Name erforderlich').max(120),
  })
  .refine((d) => d.password === d.password2, {
    message: 'Passwörter stimmen nicht überein',
    path: ['password2'],
  });
type FormValues = z.infer<typeof formSchema>;

function CheckRow({ label, check }: { label: string; check: Check | undefined }) {
  const { t } = useTranslation();
  let icon = <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  let detail: string | undefined;
  if (check) {
    if (check.skipped) {
      icon = <MinusCircle className="size-4 text-muted-foreground" />;
      detail = check.reason ?? t('setup.check_skipped');
    } else if (check.ok) {
      icon = <CheckCircle2 className="size-4 text-emerald-600" />;
    } else {
      icon = <XCircle className="size-4 text-destructive" />;
      detail = check.error ?? t('setup.check_unreachable');
    }
  }
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="font-medium">{label}</span>
        {detail ? <span className="block text-xs text-muted-foreground break-all">{detail}</span> : null}
      </span>
    </div>
  );
}

export function SetupWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'loading' | 'check' | 'form'>('loading');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { firstName: '', email: '', password: '', password2: '', workspaceName: '' },
  });

  const runHealth = async () => {
    setChecking(true);
    try {
      const { data } = await api.get<HealthResponse>('/setup/health');
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  };

  // On mount: only show the wizard when the instance still needs setup.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ needsSetup: boolean }>('/setup/status');
        if (!alive) return;
        if (!data.needsSetup) {
          navigate('/login', { replace: true });
          return;
        }
        setPhase('check');
        void runHealth();
      } catch {
        // Backend unreachable — stay on the check screen so the user sees why.
        if (alive) setPhase('check');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dbOk = health?.database?.ok === true;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSaving(true);
    try {
      const { data } = await api.post<{
        token: string;
        refresh_token?: string;
        workspaceId?: string;
      }>('/setup/init', {
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName,
        firstName: values.firstName ?? '',
      });
      // Access token in memory; the refresh token is set as an httpOnly cookie
      // by the setup response. The hard-navigate reloads into a clean session —
      // authProvider.check() silently refreshes from the cookie.
      setAccessToken(data.token);
      if (data.workspaceId) writeAuth(WORKSPACE_STORAGE_KEY, data.workspaceId);
      toast.success(t('toast.setup_complete'));
      window.location.assign('/');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error(t('toast.instance_already_setup'));
        navigate('/login', { replace: true });
        return;
      }
      const fields = (err as { response?: { data?: { fields?: Record<string, string> } } })?.response
        ?.data?.fields;
      setSubmitError(
        fields ? Object.values(fields).join(' ') : t('setup.generic_error'),
      );
    } finally {
      setSaving(false);
    }
  });

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center items-center space-y-2">
          <BrandLogo className="h-9 w-auto" />
          <div>
            <CardTitle className="text-base">{t('setup.welcome')}</CardTitle>
            <CardDescription>
              {phase === 'form'
                ? t('setup.subtitle_form')
                : t('setup.subtitle_check')}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {phase === 'loading' ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {phase === 'check' ? (
            <>
              <div className="space-y-3 rounded-md border p-3">
                {(Object.keys(CHECK_LABELS) as (keyof HealthResponse)[]).map((key) => (
                  <CheckRow key={key} label={t(CHECK_LABELS[key])} check={health?.[key]} />
                ))}
              </div>

              {!dbOk && !checking ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{t('setup.db_unreachable')}</span>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => void runHealth()}
                  disabled={checking}
                >
                  {checking ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  {t('setup.recheck')}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!dbOk || checking}
                  onClick={() => setPhase('form')}
                >
                  {t('setup.next')} <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </>
          ) : null}

          {phase === 'form' ? (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="workspaceName">{t('setup.workspace_name')}</Label>
                <Input id="workspaceName" autoFocus placeholder={t('setup.workspace_name_placeholder')} {...register('workspaceName')} />
                {errors.workspaceName ? (
                  <p className="text-xs text-destructive">{errors.workspaceName.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firstName">{t('setup.your_name')}</Label>
                <Input id="firstName" autoComplete="name" {...register('firstName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('setup.email')}</Label>
                <Input id="email" type="email" autoComplete="email" {...register('email')} />
                {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('setup.password')}</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password2">{t('setup.password_repeat')}</Label>
                <Input id="password2" type="password" autoComplete="new-password" {...register('password2')} />
                {errors.password2 ? (
                  <p className="text-xs text-destructive">{errors.password2.message}</p>
                ) : null}
              </div>

              {submitError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPhase('check')}
                  disabled={saving}
                >
                  {t('setup.back')}
                </Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> {t('setup.setting_up')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 size-4" /> {t('setup.finish')}
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupWizardPage;
