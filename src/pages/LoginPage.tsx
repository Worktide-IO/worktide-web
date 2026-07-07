import { useLogin } from '@refinedev/core';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { api } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandingFooter } from '@/components/BrandingFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Bitte gültige Email-Adresse eingeben'),
  password: z.string().min(1, 'Passwort erforderlich'),
  remember: z.boolean(),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { mutate: login, isPending } = useLogin<LoginValues>();

  // First-run detection: if the instance has no users yet, there's nothing to
  // log into — send the visitor to the setup wizard. Fail-open on any error.
  useEffect(() => {
    let alive = true;
    api
      .get<{ needsSetup: boolean }>('/setup/status')
      .then(({ data }) => {
        if (alive && data?.needsSetup) navigate('/setup', { replace: true });
      })
      .catch(() => {
        /* ignore — stay on login */
      });
    return () => {
      alive = false;
    };
  }, [navigate]);
  // Refine's useLogin().error doesn't surface auth-provider failures that
  // return { success: false, error: ... } — those just show a toast. So
  // we track the message ourselves via the onError callback to keep a
  // visible red banner inside the form.
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = handleSubmit((values) => {
    setLoginError(null);
    login(values as LoginValues, {
      onError: (err) => {
        const msg =
          (err as { message?: string } | undefined)?.message ??
          'Ungültige Zugangsdaten.';
        setLoginError(msg);
      },
      onSuccess: (data) => {
        // Refine packs a non-throwing auth-provider failure as a
        // resolved value with `success: false` — surface those too.
        if (data && typeof data === 'object' && 'success' in data && data.success === false) {
          const errObj = (data as { error?: { message?: string } }).error;
          setLoginError(errObj?.message ?? 'Ungültige Zugangsdaten.');
        }
      },
    });
  });

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
      <Card className="w-full">
        <form onSubmit={onSubmit} noValidate>
          <CardHeader className="text-center items-center">
            <BrandLogo className="h-9 w-auto" />
            <CardDescription>Bitte anmelden, um fortzufahren.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </div>
            </div>

            <Controller
              control={control}
              name="remember"
              render={({ field }) => (
                <label
                  htmlFor="remember"
                  className="flex items-center gap-2 text-sm select-none cursor-pointer"
                >
                  <Checkbox
                    id="remember"
                    checked={!!field.value}
                    onCheckedChange={(checked) => field.onChange(!!checked)}
                  />
                  Auf diesem Gerät angemeldet bleiben
                </label>
              )}
            />
            <p className="text-xs text-muted-foreground -mt-2">
              Aus = Sitzung wird beendet, wenn das Browserfenster
              geschlossen wird. Für geteilte Rechner empfohlen.
            </p>

            {loginError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Anmelden …' : 'Anmelden'}
            </Button>
          </CardContent>
        </form>
      </Card>
      <BrandingFooter />
      </div>
    </div>
  );
}
