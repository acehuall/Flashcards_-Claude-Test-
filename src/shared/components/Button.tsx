import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'correct' | 'incorrect' | 'flag';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-app-nav text-white hover:bg-app-nav-dark active:scale-95',
  secondary: 'bg-app-surface text-app-primary border border-app-border hover:bg-app-card-q active:scale-95',
  ghost:     'bg-transparent text-app-secondary hover:text-app-primary hover:bg-app-surface active:scale-95',
  danger:    'bg-app-incorrect text-white hover:opacity-90 active:scale-95',
  correct:   'bg-app-correct text-white hover:opacity-90 active:scale-95',
  incorrect: 'bg-app-incorrect text-white hover:opacity-90 active:scale-95',
  flag:      'bg-app-flag text-app-bg hover:opacity-90 active:scale-95',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-pill font-medium',
        'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-nav focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
