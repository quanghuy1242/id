"use client";

import type { ReactNode } from "react";
import { Inline, LinkButton, Text } from "@idco/ui";

type AdminDetailTitleRowProps = {
  readonly backHref: string;
  readonly backLabel: string;
  readonly title: ReactNode;
  readonly showBack?: boolean;
  readonly children?: ReactNode;
};

export function AdminDetailTitleRow({
  backHref,
  backLabel,
  title,
  showBack = true,
  children,
}: AdminDetailTitleRowProps) {
  const label = `Back to ${backLabel}`;

  return (
    <Inline gap="sm">
      {showBack ? (
        <LinkButton
          href={backHref}
          variant="secondary"
          size="sm"
          hideOnMobile
          iconName="ChevronLeft"
          ariaLabel={label}
          tooltip={label}
        />
      ) : null}
      <Text variant="h1">{title}</Text>
      {children}
    </Inline>
  );
}
