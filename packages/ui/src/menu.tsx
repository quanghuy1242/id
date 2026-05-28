// DaisyUI 5: https://daisyui.com/components/menu/
// React Aria: https://react-spectrum.adobe.com/react-aria/Menu.html
"use client";

import { type ReactNode, Children } from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover,
  type MenuProps,
  type MenuItemProps,
} from "react-aria-components";

export function MenuTrigger({ children, ...props }: { children: ReactNode; isOpen?: boolean; onOpenChange?: (isOpen: boolean) => void }) {
  const [trigger, menu] = Children.toArray(children) as [React.ReactElement, React.ReactElement];

  return (
    <AriaMenuTrigger {...props}>
      {trigger}
      <Popover
        className="z-50 data-[entering]:animate-popover-in data-[exiting]:animate-popover-out"
        placement="bottom end"
        offset={4}
        crossOffset={0}
      >
        {menu}
      </Popover>
    </AriaMenuTrigger>
  );
}

export function Menu<T extends object>(props: MenuProps<T>) {
  return (
    <AriaMenu
      {...props}
      render={((rp: Record<string, unknown>) => <ul {...rp} />) as never}
      className="menu popover-panel w-52 z-1"
    />
  );
}

type MenuItemHref = {
  readonly href: string;
  readonly badge?: string;
  readonly label: string;
};

export function MenuItem(props: MenuItemProps & Partial<MenuItemHref>) {
  const textValue = props.textValue ?? props.label ?? (typeof props.children === "string" ? props.children : undefined);

  return (
    <AriaMenuItem
      {...props}
      textValue={textValue}
      render={((dp: Record<string, unknown>) =>
        "href" in dp ? (
          <li>
            <a {...dp} />
          </li>
        ) : (
          <li {...dp} />
        )
      ) as never}
    >
      {props.label ?? (props.children as ReactNode)}
      {props.badge ? <span className="badge badge-sm">{props.badge}</span> : null}
    </AriaMenuItem>
  );
}
