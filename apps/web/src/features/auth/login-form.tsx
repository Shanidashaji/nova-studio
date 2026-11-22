'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest } from '@nova/shared';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, ApiRequestError } from '@/lib/api';

type Values = z.input<typeof LoginRequest>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<
    Values,
    unknown,
    z.output<typeof LoginRequest>
  >({
    resolver: zodResolver(LoginRequest),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: values });
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.code === 'RATE_LIMITED'
          ? 'Too many attempts. Wait a minute and try again.'
          : e instanceof Error
            ? e.message
            : 'Sign-in failed.',
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <Field label="Email" error={formState.errors.email?.message}>
        {(p) => (
          <Input {...p} type="email" autoComplete="username" autoFocus {...register('email')} />
        )}
      </Field>
      <Field label="Password" error={formState.errors.password?.message}>
        {(p) => (
          <Input {...p} type="password" autoComplete="current-password" {...register('password')} />
        )}
      </Field>
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-critical-line bg-critical-soft px-3 py-2 text-xs text-critical"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={formState.isSubmitting}
        className="mt-1 rounded-full"
      >
        Enter the studio <ArrowRight />
      </Button>
    </form>
  );
}
