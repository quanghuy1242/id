export async function GET() {
  return Response.json({
    ok: true,
    service: "id-ui",
    message: "Admin BFF placeholder. Implement UI-owned endpoints here when they need server-side shaping.",
  });
}
