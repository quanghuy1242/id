import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: "button" | "submit";
  readonly name?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onClick?: () => void;
};

export function Button({
  variant = "primary",
  size = "sm",
  type = "button",
  name,
  value,
  disabled,
  children,
  onClick,
}: ButtonProps) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-neutral",
    danger: "btn-error",
  }[variant];
  const sizeClass = {
    sm: "btn-sm",
    md: "btn-md",
  }[size];

  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      onClick={onClick}
      className={`btn ${sizeClass} ${variantClass}`}
    >
      {children}
    </button>
  );
}

type LinkButtonProps = {
  readonly href: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
};

export function LinkButton({ href, variant = "primary", size = "sm", children }: LinkButtonProps) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-neutral",
    danger: "btn-error",
  }[variant];
  const sizeClass = {
    sm: "btn-sm",
    md: "btn-md",
  }[size];

  return (
    <a href={href} className={`btn ${sizeClass} ${variantClass}`}>
      {children}
    </a>
  );
}
