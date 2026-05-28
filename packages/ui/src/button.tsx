// DaisyUI 5: https://daisyui.com/components/button/
import type { ReactNode } from "react";
import { NavIcon } from "./nav-icons";

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
  readonly iconName?: string;
  readonly iconPosition?: "left" | "right";
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  name,
  value,
  disabled,
  children,
  onClick,
  iconName,
  iconPosition = "left",
}: ButtonProps) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-outline",
    danger: "btn-error",
  }[variant];
  const sizeClass = {
    sm: "btn-sm",
    md: "",
  }[size];

  const icon = iconName ? <NavIcon name={iconName} variant="dock" /> : null;

  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      onClick={onClick}
      className={`btn ${sizeClass} ${variantClass}`.trim()}
    >
      {iconPosition === "left" && icon}
      {children}
      {iconPosition === "right" && icon}
    </button>
  );
}

type LinkButtonProps = {
  readonly href: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
};

export function LinkButton({ href, variant = "primary", size = "md", children }: LinkButtonProps) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-outline",
    danger: "btn-error",
  }[variant];
  const sizeClass = {
    sm: "btn-sm",
    md: "",
  }[size];

  return (
    <a href={href} className={`btn ${sizeClass} ${variantClass}`.trim()}>
      {children}
    </a>
  );
}
