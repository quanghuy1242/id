"use client";

import type { ReactNode } from "react";
import { Inline, LinkButton, Text } from "@id/ui";

type AdminDetailTitleRowProps = {
  readonly backHref: string;
  readonly backLabel: string;
  readonly title: ReactNode;
  readonly children?: ReactNode;
};

export function AdminDetailTitleRow({
  backHref,
  backLabel,
  title,
  children,
}: AdminDetailTitleRowProps) {
  const label = `Back to ${backLabel}`;

  return (
    <Inline gap="sm">
      <LinkButton
        href={backHref}
        variant="secondary"
        size="sm"
        hideOnMobile
        iconName="ChevronLeft"
        ariaLabel={label}
        tooltip={label}
      />
      <Text variant="h1">{title}</Text>
      {children}
    </Inline>
  );
}
