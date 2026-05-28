// DaisyUI 5: https://daisyui.com/components/button/
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button as AriaButton } from "react-aria-components";
import { NavIcon } from "./nav-icons";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: "button" | "submit";
  readonly name?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly circle?: boolean;
  readonly children?: ReactNode;
  readonly ariaLabel?: string;
  readonly onClick?: () => void;
  readonly iconName?: string;
  readonly iconPosition?: "left" | "right";
};

function buttonClass(variant: ButtonVariant, size: ButtonSize, circle?: boolean): string {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-outline",
    danger: "btn-error",
    ghost: "btn-ghost",
  }[variant];
  const sizeClass = {
    sm: "btn-sm",
    md: "",
  }[size];
  const shapeClass = circle ? " btn-circle" : "";

  return `btn ${sizeClass} ${variantClass}${shapeClass}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  name,
  value,
  disabled,
  circle,
  children,
  ariaLabel,
  onClick,
  iconName,
  iconPosition = "left",
}: ButtonProps) {
  const icon = iconName ? <NavIcon name={iconName} variant="dock" /> : null;
  const isIconOnly = Boolean(!children && iconName);

  return (
    <AriaButton
      type={type}
      name={name}
      value={value}
      isDisabled={disabled}
      onPress={onClick}
      aria-label={ariaLabel}
      className={buttonClass(variant, size, circle || isIconOnly)}
    >
      {iconPosition === "left" && icon}
      {children}
      {iconPosition === "right" && icon}
    </AriaButton>
  );
}

type LinkButtonProps = {
  readonly href: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
};

export function LinkButton({ href, variant = "primary", size = "md", children }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}
