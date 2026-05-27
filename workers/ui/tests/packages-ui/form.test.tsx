// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextInput, HiddenInput, RadioGroup } from "@id/ui";

describe("TextInput", () => {
  it("renders a labeled input", () => {
    render(<TextInput label="Email" name="email" />);
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
  });

  it("renders email type input", () => {
    render(<TextInput label="Email" name="email" type="email" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).toHaveAttribute("type", "email");
  });

  it("renders password type input", () => {
    render(<TextInput label="Password" name="password" type="password" />);
    const input = screen.getByLabelText(/password/i);
    expect(input).toHaveAttribute("type", "password");
  });

  it("sets required attribute", () => {
    render(<TextInput label="Name" name="name" required />);
    const input = screen.getByRole("textbox", { name: /name/i });
    expect(input).toBeRequired();
  });

  it("sets autoComplete attribute", () => {
    render(<TextInput label="Email" name="email" autoComplete="username" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).toHaveAttribute("autoComplete", "username");
  });

  it("sets defaultValue", () => {
    render(<TextInput label="Name" name="name" defaultValue="John" />);
    const input = screen.getByRole("textbox", { name: /name/i });
    expect(input).toHaveValue("John");
  });

  it("shows error message when error prop is provided", () => {
    render(<TextInput label="Email" name="email" error="Invalid email" />);
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it("sets aria-invalid when error is present", () => {
    render(<TextInput label="Email" name="email" error="Invalid email" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("does not set aria-invalid when no error", () => {
    render(<TextInput label="Email" name="email" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("applies input-error class when error is present", () => {
    render(<TextInput label="Email" name="email" error="Invalid" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).toHaveClass("input-error");
  });

  it("uses default input size instead of input-sm", () => {
    render(<TextInput label="Email" name="email" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).not.toHaveClass("input-sm");
  });

  it("applies input-sm when small size is specified", () => {
    render(<TextInput label="Email" name="email" size="sm" />);
    const input = screen.getByRole("textbox", { name: /email/i });
    expect(input).toHaveClass("input-sm");
  });
});

describe("HiddenInput", () => {
  it("renders a hidden input with name and value", () => {
    render(<HiddenInput name="token" value="abc123" />);
    const input = screen.getByDisplayValue("abc123");
    expect(input).toHaveAttribute("type", "hidden");
    expect(input).toHaveAttribute("name", "token");
    expect(input).toHaveAttribute("value", "abc123");
  });
});

describe("RadioGroup", () => {
  const options = [
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
  ] as const;

  it("renders a fieldset with legend", () => {
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option1"
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/select/i)).toBeInTheDocument();
  });

  it("renders all radio options", () => {
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option1"
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/option 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/option 2/i)).toBeInTheDocument();
  });

  it("checks the radio matching the value prop", () => {
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option2"
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/option 1/i)).not.toBeChecked();
    expect(screen.getByLabelText(/option 2/i)).toBeChecked();
  });

  it("calls onChange with the correct value when a radio is clicked", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option1"
        onChange={onChange}
      />
    );
    screen.getByLabelText(/option 2/i).click();
    expect(onChange).toHaveBeenCalledWith("option2");
  });

  it("uses default radio size instead of radio-xs", () => {
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option1"
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/option 1/i)).not.toHaveClass("radio-xs");
  });

  it("applies radio-sm when small size is specified", () => {
    render(
      <RadioGroup
        title="Select"
        name="selection"
        options={options}
        value="option1"
        size="sm"
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/option 1/i)).toHaveClass("radio-sm");
  });
});
