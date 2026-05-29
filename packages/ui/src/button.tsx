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
  readonly hideOnDesktop?: boolean;
  readonly hideOnMobile?: boolean;
};

function buttonClass(variant: ButtonVariant, size: ButtonSize, circle?: boolean, hideOnDesktop?: boolean, hideOnMobile?: boolean): string {
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
  const hideClass = [hideOnDesktop ? "lg:hidden" : "", hideOnMobile ? "hidden lg:inline-flex" : ""].filter(Boolean).join(" ");

  return `btn ${sizeClass} ${variantClass}${shapeClass} ${hideClass}`.trim();
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
  hideOnDesktop,
  hideOnMobile,
}: ButtonProps) {
  const icon = iconName ? <NavIcon name={iconName} variant="dock" /> : null;

  return (
    <AriaButton
      type={type}
      name={name}
      value={value}
      isDisabled={disabled}
      onPress={onClick}
      aria-label={ariaLabel}
      className={buttonClass(variant, size, circle, hideOnDesktop, hideOnMobile)}
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
  readonly children?: ReactNode;
  readonly hideOnMobile?: boolean;
  readonly iconName?: string;
  readonly ariaLabel?: string;
};

export function LinkButton({ href, variant = "primary", size = "md", children, hideOnMobile, iconName, ariaLabel }: LinkButtonProps) {
  const icon = iconName ? <NavIcon name={iconName} variant="dock" /> : null;

  return (
    <Link href={href} className={buttonClass(variant, size, false, false, hideOnMobile)} aria-label={ariaLabel}>
      {icon}
      {children}
    </Link>
  );
}
