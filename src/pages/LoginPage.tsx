import { useLogin } from '@refinedev/core';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Bitte gültige Email-Adresse eingeben'),
  password: z.string().min(1, 'Passwort erforderlich'),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { mutate: login, isPending, error } = useLogin<LoginValues>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => login(values));

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <form onSubmit={onSubmit} noValidate>
          <CardHeader className="text-center items-center">
            <img
              src="/brand/logo/worktide-lockup.svg"
              alt="Worktide"
              className="h-9 w-auto"
            />
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
            </div>

            {error?.message ? (
              <p className="text-sm text-destructive" role="alert">
                {error.message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Anmelden …' : 'Anmelden'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
