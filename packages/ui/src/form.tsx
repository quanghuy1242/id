type TextInputProps = {
  readonly label: string;
  readonly name: string;
  readonly type?: "email" | "password" | "text";
  readonly autoComplete?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
};

export function TextInput({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  defaultValue,
}: TextInputProps) {
  return (
    <label htmlFor={name} className="form-control w-full gap-1">
      <span className="label-text font-medium text-base-content/80">{label}</span>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-label={label}
        className="input input-bordered input-sm w-full bg-base-100 text-base-content focus:input-primary"
      />
    </label>
  );
}

type HiddenInputProps = {
  readonly name: string;
  readonly value: string;
};

export function HiddenInput({ name, value }: HiddenInputProps) {
  return <input type="hidden" name={name} value={value} />;
}
