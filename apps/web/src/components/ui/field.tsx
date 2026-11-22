import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-2.5 text-sm text-text placeholder:text-text-3 transition-colors duration-[var(--m-fast)] hover:border-text-3 focus-visible:border-signal focus-visible:outline-none aria-[invalid=true]:border-critical disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, 'h-8', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(control, 'min-h-[72px] py-1.5 leading-5', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(control, 'h-8 pr-7', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-text-2">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="break-words text-xs text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-2">
      <input type="checkbox" className="size-3.5 accent-[var(--signal)]" {...props} />
      {label}
    </label>
  );
}
