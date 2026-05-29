"use client";

// DaisyUI 5: https://daisyui.com/components/breadcrumbs/
// React Aria: https://react-spectrum.adobe.com/react-aria/Menu.html

import { useCallback, useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { MenuTrigger, Menu, MenuItem } from "./menu";

type ResponsiveBreadcrumbProps = {
  readonly items: readonly string[];
};

export function ResponsiveBreadcrumb({ items }: ResponsiveBreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [collapseIndex, setCollapseIndex] = useState(0);
  const measuring = useRef(false);

  const measureRef = useRef<(() => void) | undefined>(undefined);

  measureRef.current = useCallback(() => {
    if (measuring.current) return;
    measuring.current = true;

    const list = listRef.current;
    if (!list) {
      measuring.current = false;
      return;
    }

    const lis = list.querySelectorAll<HTMLElement>("li");
    if (lis.length === 0) {
      measuring.current = false;
      return;
    }

    const original: string[] = [];
    lis.forEach((li) => {
      original.push(li.style.display);
      li.style.display = "";
    });
    void list.offsetHeight;

    if (list.scrollWidth > list.clientWidth) {
      let idx = 0;
      for (; idx < lis.length - 1; idx++) {
        lis[idx].style.display = "none";
        void list.offsetHeight;
        if (list.scrollWidth <= list.clientWidth) break;
      }
      setCollapseIndex((prev) => Math.max(prev, idx));
    } else {
      let newIdx = collapseIndex;
      for (; newIdx > 0; newIdx--) {
        lis[newIdx - 1].style.display = "";
        void list.offsetHeight;
        if (list.scrollWidth > list.clientWidth) {
          lis[newIdx - 1].style.display = "none";
          break;
        }
      }
      if (newIdx < collapseIndex) setCollapseIndex(newIdx);
    }

    lis.forEach((li, i) => {
      li.style.display = original[i];
    });

    measuring.current = false;
  }, [collapseIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measureRef.current?.();
    });
    observer.observe(container);
    requestAnimationFrame(() => measureRef.current?.());

    return () => observer.disconnect();
  }, []);

  const collapsedItems = items.slice(0, collapseIndex);

  return (
    <div ref={containerRef} className="breadcrumbs text-sm text-base-content/60 min-w-0 flex items-center overflow-hidden">
      {collapsedItems.length > 0 && (
        <MenuTrigger>
          <button
            type="button"
            aria-label="More breadcrumbs"
            className="btn btn-ghost btn-xs px-1 min-h-0 h-auto"
          >
            <Ellipsis className="size-3" aria-hidden="true" />
          </button>
          <Menu
            aria-label="Collapsed breadcrumbs"
            className="menu menu-sm dropdown-content bg-base-100 rounded-box shadow w-40"
          >
            {collapsedItems.map((item) => (
              <MenuItem key={item} id={item}>{item}</MenuItem>
            ))}
          </Menu>
        </MenuTrigger>
      )}
      <ol ref={listRef}>
        {items.map((item, i) => (
          <li key={item} style={{ display: i < collapseIndex ? "none" : undefined }}>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}
