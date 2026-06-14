import { useLogin } from '@refinedev/core';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Bitte gültige Email-Adresse eingeben'),
  password: z.string().min(1, 'Passwort erforderlich'),
});
type LoginValues = z.infer<typeof loginSchema>;

/**
 * Minimum-viable login form — shadcn-flavoured inputs done by hand so the
 * scaffold doesn't depend on `npx shadcn add` being run yet. Once shadcn is
 * initialised, swap the bare inputs for the generated <Input> / <Button>
 * components without touching the surrounding form logic.
 */
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
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm"
      >
        <header className="space-y-1 text-center">
          <h1 className="text-2xl">Worktide</h1>
          <p className="text-sm text-muted-foreground">Bitte anmelden, um fortzufahren.</p>
        </header>

        <div className="space-y-4">
          <Field id="email" label="Email" error={errors.email?.message}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              className={inputCn}
              {...register('email')}
            />
          </Field>
          <Field id="password" label="Passwort" error={errors.password?.message}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={inputCn}
              {...register('password')}
            />
          </Field>
        </div>

        {error?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2',
            'text-sm font-medium text-primary-foreground transition-colors',
            'disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary/90',
          )}
        >
          {isPending ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

const inputCn =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
