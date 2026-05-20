import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly type?: "button" | "submit";
  readonly name?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onClick?: () => void;
};

export function Button({
  variant = "primary",
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

  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-sm ${variantClass}`}
    >
      {children}
    </button>
  );
}
