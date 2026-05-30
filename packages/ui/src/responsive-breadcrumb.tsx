"use client";

// DaisyUI 5: https://daisyui.com/components/breadcrumbs/
// React Aria: https://react-spectrum.adobe.com/react-aria/Menu.html

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuTrigger, Menu, MenuItem } from "./menu";
import { Button } from "./button";

type ResponsiveBreadcrumbProps = {
  readonly items: readonly string[];
};

export function ResponsiveBreadcrumb({ items }: ResponsiveBreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [collapseCount, setCollapseCount] = useState(0);
  const measuring = useRef(false);

  const measure = useCallback(() => {
    if (measuring.current) return;
    measuring.current = true;

    const list = listRef.current;
    const container = containerRef.current;
    if (!list || !container) {
      measuring.current = false;
      return;
    }

    const lis = list.querySelectorAll<HTMLElement>("li");
    if (lis.length === 0) {
      measuring.current = false;
      return;
    }

    // Reset all items to visible for measurement
    lis.forEach((li) => { li.style.display = ""; });
    void list.offsetHeight;

    const available = container.clientWidth;
    const full = list.scrollWidth;

    if (full > available) {
      let hidden = 0;
      for (let i = 0; i < lis.length - 1; i++) {
        lis[i].style.display = "none";
        hidden++;
        void list.offsetHeight;
        if (list.scrollWidth <= available) break;
      }
      setCollapseCount(hidden);
    } else {
      setCollapseCount(0);
    }

    measuring.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    requestAnimationFrame(() => measure());

    return () => observer.disconnect();
  }, [measure]);

  const collapsedItems = items.slice(0, collapseCount);
  const hasCollapsed = collapsedItems.length > 0;

  return (
    <nav ref={containerRef} aria-label="Breadcrumb" className="flex-1 min-w-0 overflow-hidden">
      <div className="flex items-center text-sm text-base-content/60">
        {hasCollapsed ? (
          <MenuTrigger placement="bottom start">
            <Button
              variant="ghost"
              size="sm"
              ariaLabel="Show more breadcrumbs"
              iconName="Ellipsis"
            />
            <Menu aria-label="Collapsed breadcrumbs">
              {collapsedItems.map((item) => (
                <MenuItem key={item} id={item}>{item}</MenuItem>
              ))}
            </Menu>
          </MenuTrigger>
        ) : null}
        {hasCollapsed ? <span className="opacity-40 mx-1 select-none" aria-hidden="true">/</span> : null}
        <ol ref={listRef} className="flex items-center gap-1 min-w-0">
          {items.map((item, i) => (
            <li
              key={item}
              className="flex items-center shrink-0"
              style={{ display: i < collapseCount ? "none" : undefined }}
            >
              {i > Math.max(0, collapseCount) ? (
                <span className="opacity-40 mx-1 select-none" aria-hidden="true">/</span>
              ) : null}
              <span className="whitespace-nowrap">{item}</span>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
