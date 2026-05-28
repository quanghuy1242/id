// DaisyUI 5: https://daisyui.com/components/input/
"use client";

import { Input, SearchField } from "react-aria-components";

type TopbarSearchFieldProps = {
  readonly placeholder?: string;
};

export function TopbarSearchField({ placeholder = "Search" }: TopbarSearchFieldProps) {
  return (
    <SearchField aria-label={placeholder}>
      <Input
        placeholder={placeholder}
        className="input input-bordered input-sm w-24 md:w-auto"
      />
    </SearchField>
  );
}
