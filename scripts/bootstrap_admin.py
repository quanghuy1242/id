#!/usr/bin/env python3

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap the first admin user for id-core."
    )
    parser.add_argument(
        "--base-url",
        default="https://id.quanghuy.dev",
        help="Base URL for the deployed core worker.",
    )
    parser.add_argument("--email", required=True, help="Admin email address.")
    parser.add_argument("--name", required=True, help="Admin display name.")
    parser.add_argument(
        "--password-file",
        help="Path to a file containing the admin password.",
    )
    parser.add_argument(
        "--password",
        help="Admin password. Avoid this on shared machines; prefer --password-file or the prompt.",
    )
    parser.add_argument(
        "--org-name",
        help="Optional organization name to create and attach to the bootstrap admin.",
    )
    parser.add_argument(
        "--org-slug",
        help="Optional organization slug to create and attach to the bootstrap admin.",
    )
    return parser.parse_args()


def read_password(args: argparse.Namespace) -> str:
    if args.password and args.password_file:
        raise SystemExit("Use either --password or --password-file, not both.")
    if args.password_file:
        return open(args.password_file, "r", encoding="utf-8").read().rstrip("\r\n")
    if args.password:
        return args.password
    return getpass.getpass("Admin password: ")


def build_payload(args: argparse.Namespace, password: str) -> dict:
    payload = {
        "email": args.email,
        "password": password,
        "name": args.name,
    }
    if args.org_name or args.org_slug:
        if not (args.org_name and args.org_slug):
            raise SystemExit("Provide both --org-name and --org-slug, or neither.")
        payload["organization"] = {
            "name": args.org_name,
            "slug": args.org_slug,
        }
    return payload


def main() -> int:
    args = parse_args()
    token = os.environ.get("ID_BOOTSTRAP_TOKEN")
    if not token:
        raise SystemExit("Missing ID_BOOTSTRAP_TOKEN in the environment.")

    password = read_password(args)
    payload = build_payload(args, password)
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=args.base_url.rstrip("/") + "/api/bootstrap/admin",
        data=body,
        method="POST",
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": "bootstrap_admin/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            sys.stdout.write(response.read().decode("utf-8"))
            sys.stdout.write("\n")
            return 0
    except urllib.error.HTTPError as exc:
        sys.stderr.write(exc.read().decode("utf-8"))
        sys.stderr.write("\n")
        return exc.code or 1


if __name__ == "__main__":
    raise SystemExit(main())
