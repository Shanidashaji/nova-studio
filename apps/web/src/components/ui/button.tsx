import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-[background-color,color,border-color,opacity] duration-[var(--m-fast)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-text text-bg shadow-[0_8px_20px_-12px_rgb(0_0_0/0.6)] hover:opacity-90',
        secondary: 'border border-line-strong bg-surface-2 text-text hover:bg-surface-3',
        ghost: 'text-text-2 hover:bg-surface-3 hover:text-text',
        danger: 'border border-critical-line bg-critical-soft text-critical hover:bg-critical/20',
        ai: 'border border-ai-line bg-ai-soft text-ai hover:bg-ai/20',
      },
      size: {
        // On touch screens every size grows to a 36px target; pointer layouts keep their density.
        sm: 'h-7 px-2.5 text-xs pointer-coarse:h-9',
        md: 'h-8 px-3 text-sm pointer-coarse:h-9',
        lg: 'h-10 px-4 text-base',
        icon: 'size-8 pointer-coarse:size-9',
        'icon-sm': 'size-7 pointer-coarse:size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild, loading, disabled, children, type = 'button', ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Slot needs exactly one child, so asChild renders the child alone. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? (
              <span
                className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
