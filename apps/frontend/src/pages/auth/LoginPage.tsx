import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Compass, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import heroImage from '@/assets/login-hero.jpg';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type SignInForm = z.infer<typeof schema>;

const PYRAMID_HIGHLIGHTS = [
  'Five-tier Financial Pyramid, from Foundations to Legacy',
  'Scores update as you import transactions and assets',
  'Always know what to do next',
];

const BrandMark = ({ className }: { className?: string }) => (
  <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
      <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
    <span className="font-title text-lg">Personal Finance</span>
  </div>
);

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInForm>({
    resolver: zodResolver(schema),
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError('Sign in failed. Check your email and password.');
  });

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-muted shadow-xl lg:min-h-[640px] lg:grid-cols-2">
        <aside className="relative hidden lg:block">
          <img
            src={heroImage}
            alt="Barrels overflowing with banknotes, an oil painting by Victor Dubreuil"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50" />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="font-title text-lg">Personal Finance</span>
            </div>
            <div className="space-y-6">
              <p className="font-title text-3xl leading-snug">
                Finance should feel like a game you&rsquo;re winning, not a spreadsheet you&rsquo;re losing.
              </p>
              <ul className="space-y-2 text-sm text-white/85">
                {PYRAMID_HIGHLIGHTS.map((line) => (
                  <li key={line} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-white/60">
                Victor Dubreuil, <span className="italic">Barrels of Money</span>, c. 1897
              </p>
            </div>
          </div>
        </aside>

        <section className="flex items-center justify-center p-4 sm:p-10">
          <div className="w-full max-w-sm p-2 sm:p-4">
            <BrandMark />
            <h1 className="mt-8 font-title text-3xl text-foreground">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">Welcome back. Access your private Cashflow workspace.</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  {...register('email')}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pr-10"
                    {...register('password')}
                    aria-invalid={!!errors.password}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p role="alert" className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">Accounts are provided during the Cashflow pilot.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
