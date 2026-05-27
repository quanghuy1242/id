"use client";

// DaisyUI 5: https://daisyui.com/components/select/
// React Aria: https://react-spectrum.adobe.com/react-aria/Select.html
import {
  Select,
  SelectValue,
  Button as SelectTrigger,
  Popover,
  ListBox,
  ListBoxItem,
} from "react-aria-components";
import { ChevronDown } from "lucide-react";

type FilterOption = {
  readonly value: string;
  readonly label: string;
};

type FilterDropdownProps = {
  readonly label: string;
  readonly options: ReadonlyArray<FilterOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
};

export function FilterDropdown({ label, options, value, onChange }: FilterDropdownProps) {
  return (
    <Select
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
    >
      <SelectTrigger className="btn btn-sm btn-neutral flex items-center gap-1">
        <span className="text-base-content/60 text-xs mr-0.5">{label}:</span>
        <SelectValue className="text-sm" />
        <ChevronDown className="h-3 w-3 text-base-content/60" aria-hidden="true" />
      </SelectTrigger>
      <Popover className="z-50 min-w-32">
        <ListBox className="menu menu-sm bg-base-100 border border-base-300 rounded-box shadow-lg p-1">
          {options.map((opt) => (
            <ListBoxItem
              key={opt.value}
              id={opt.value}
              className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-base-200 focus:bg-base-200 outline-none data-[selected]:font-medium"
            >
              {opt.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
