import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type SignInForm = z.infer<typeof schema>;

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInForm>({
    resolver: zodResolver(schema),
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError('Sign in failed. Check your email and password.');
  });

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">PERSONAL FINANCE</p>
        <h1 className="mt-3 font-title text-3xl text-foreground">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Access your private Cashflow workspace.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email} />
            {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} />
            {errors.password && <p role="alert" className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">Accounts are provided during the Cashflow pilot.</p>
      </div>
    </main>
  );
}
