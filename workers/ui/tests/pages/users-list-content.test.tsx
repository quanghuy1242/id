// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { UsersListContent } from "@/app/admin/_components/identity/users-list-content";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { CreateUserBody, ListUsersParams, User } from "@/app/admin/_actions/users";

describe("UsersListContent", () => {
  it("submits the create-user dialog through injected actions", async () => {
    const listUsers = vi.fn<(params: ListUsersParams) => Promise<{
      users: User[];
      total: number;
      limit: number;
      offset: number;
    }>>().mockResolvedValue({
      users: mockUsers,
      total: mockUsers.length,
      limit: 25,
      offset: 0,
    });
    const createUser = vi.fn<(body: CreateUserBody) => Promise<{ user: User }>>()
      .mockResolvedValue({ user: mockUsers[0] });

    render(
      <UsersListContent
        defaultCreateOpen
        actions={{ listUsers, createUser }}
      />
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "password12345",
        role: "user",
      });
    });
  });

  it("shows create-user API errors inside the open dialog", async () => {
    const listUsers = vi.fn<(params: ListUsersParams) => Promise<{
      users: User[];
      total: number;
      limit: number;
      offset: number;
    }>>().mockResolvedValue({
      users: mockUsers,
      total: mockUsers.length,
      limit: 25,
      offset: 0,
    });
    const createUser = vi.fn<(body: CreateUserBody) => Promise<{ user: User }>>()
      .mockRejectedValue(new Error("Email already exists"));

    render(
      <UsersListContent
        defaultCreateOpen
        actions={{ listUsers, createUser }}
      />
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Email already exists");
    });
  });
});
