/** The developer preview of the marketing page is public now at /welcome. */
export function GET() {
  return new Response(null, { status: 308, headers: { Location: "/welcome" } });
}
