// DaisyUI 5: https://daisyui.com/components/input/
type TextInputProps = {
  readonly label: string;
  readonly name: string;
  readonly type?: "email" | "password" | "text";
  readonly size?: "sm" | "md";
  readonly autoComplete?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
  readonly error?: string;
};

export function TextInput({
  label,
  name,
  type = "text",
  size = "md",
  autoComplete,
  required,
  defaultValue,
  error,
}: TextInputProps) {
  const sizeClass = size === "sm" ? "input-sm" : "";

  return (
    <label htmlFor={name} className="form-control w-full">
      <div className="label">
        <span className="label-text text-base font-medium text-base-content">{label}</span>
      </div>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={`input input-bordered ${sizeClass} w-full bg-base-100 text-base-content focus:input-primary${error ? " input-error" : ""}`.trim()}
      />
      {error && (
        <div className="label">
          <span className="label-text-alt text-error">{error}</span>
        </div>
      )}
    </label>
  );
}

// DaisyUI 5 Radio: https://daisyui.com/components/radio/
type HiddenInputProps = {
  readonly name: string;
  readonly value: string;
};

export function HiddenInput({ name, value }: HiddenInputProps) {
  return <input type="hidden" name={name} value={value} />;
}

type RadioOption = {
  readonly value: string;
  readonly label: string;
};

type RadioGroupProps = {
  readonly title: string;
  readonly name: string;
  readonly options: readonly RadioOption[];
  readonly value: string;
  readonly size?: "sm" | "md";
  readonly onChange: (value: string) => void;
};

export function RadioGroup({ title, name, options, value, size = "md", onChange }: RadioGroupProps) {
  const radioSizeClass = size === "sm" ? "radio-sm" : "";

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend text-base font-medium text-base-content">{title}</legend>
      {options.map((option) => (
        <label key={option.value} className="label cursor-pointer justify-start gap-3 py-0.5">
          <input
            type="radio"
            name={name}
            value={option.value}
            aria-label={option.label}
            className={`radio ${radioSizeClass} radio-primary`.trim()}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="label-text text-base text-base-content">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
