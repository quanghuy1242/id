import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Page not found
        </h1>
        <p style={{ marginBottom: "1rem", color: "#475467" }}>
          The page you are looking for does not exist.
        </p>
        <Link href="/admin" style={{ color: "#155eef", textDecoration: "underline" }}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
