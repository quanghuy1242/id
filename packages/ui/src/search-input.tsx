"use client";

// DaisyUI 5: https://daisyui.com/components/input/
// React Aria: https://react-spectrum.adobe.com/react-aria/SearchField.html
import { SearchField, Input, Button as ClearButton } from "react-aria-components";

type SearchInputProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
};

export function SearchInput({ value, onChange, placeholder = "Search..." }: SearchInputProps) {
  return (
    <SearchField
      value={value}
      onChange={onChange}
      aria-label="Search"
      className="relative flex items-center"
    >
      <Input
        placeholder={placeholder}
        className="input input-bordered input-sm bg-base-100 text-base-content focus:input-primary pr-7 w-48"
      />
      <ClearButton
        aria-label="Clear search"
        className="absolute right-2 text-base-content/40 hover:text-base-content/70 text-base leading-none hidden [.group-data-empty=false_&]:block"
      >
        ✕
      </ClearButton>
    </SearchField>
  );
}
