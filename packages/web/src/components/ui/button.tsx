import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)]',
        primary:
          'bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90',
        ghost: 'text-[var(--text-2)] hover:bg-[var(--surface-2)]',
      },
      size: {
        sm: 'h-7 px-2',
        md: 'h-9 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

/** Shared button props, including optional shadcn-style Slot composition. */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/** Theme-aware app button with variant and size classes. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
