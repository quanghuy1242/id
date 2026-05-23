// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text, Heading } from "@id/ui";

describe("Text", () => {
  it("renders body text by default", () => {
    render(<Text>Body text</Text>);
    const element = screen.getByText(/body text/i);
    expect(element).toBeInTheDocument();
    expect(element.tagName.toLowerCase()).toBe("p");
  });

  it("renders h1 variant as h1 element", () => {
    render(<Text variant="h1">Heading 1</Text>);
    const element = screen.getByText(/heading 1/i);
    expect(element.tagName.toLowerCase()).toBe("h1");
    expect(element).toHaveClass("text-2xl", "font-bold");
  });

  it("renders h2 variant as h2 element", () => {
    render(<Text variant="h2">Heading 2</Text>);
    const element = screen.getByText(/heading 2/i);
    expect(element.tagName.toLowerCase()).toBe("h2");
    expect(element).toHaveClass("text-xl", "font-semibold");
  });

  it("renders h3 variant as h3 element", () => {
    render(<Text variant="h3">Heading 3</Text>);
    const element = screen.getByText(/heading 3/i);
    expect(element.tagName.toLowerCase()).toBe("h3");
    expect(element).toHaveClass("text-lg", "font-semibold");
  });

  it("renders caption variant as p element", () => {
    render(<Text variant="caption">Caption</Text>);
    const element = screen.getByText(/caption/i);
    expect(element.tagName.toLowerCase()).toBe("p");
    expect(element).toHaveClass("text-xs");
  });

  it("overrides element type with as prop", () => {
    render(<Text variant="h1" as="div">Custom</Text>);
    const element = screen.getByText(/custom/i);
    expect(element.tagName.toLowerCase()).toBe("div");
    expect(element).toHaveClass("text-2xl", "font-bold");
  });

  it("applies text-base-content class to all variants", () => {
    const { container } = render(
      <>
        <Text variant="h1">H1</Text>
        <Text variant="h2">H2</Text>
        <Text variant="h3">H3</Text>
        <Text variant="body">Body</Text>
        <Text variant="caption">Caption</Text>
      </>
    );
    const elements = container.querySelectorAll("[class*='text-base-content']");
    expect(elements.length).toBe(5);
  });
});

describe("Heading", () => {
  it("renders h2 by default", () => {
    render(<Heading>Default Heading</Heading>);
    const element = screen.getByText(/default heading/i);
    expect(element.tagName.toLowerCase()).toBe("h2");
  });

  it("renders h1 when level is h1", () => {
    render(<Heading level="h1">Level 1</Heading>);
    const element = screen.getByText(/level 1/i);
    expect(element.tagName.toLowerCase()).toBe("h1");
  });

  it("renders h3 when level is h3", () => {
    render(<Heading level="h3">Level 3</Heading>);
    const element = screen.getByText(/level 3/i);
    expect(element.tagName.toLowerCase()).toBe("h3");
  });
});
