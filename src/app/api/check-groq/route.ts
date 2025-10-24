'use server';

export async function GET() {
  const hasKey = Boolean(process.env.GROQ_API_KEY);
  return new Response(JSON.stringify({ hasKey }), {
    headers: { 'content-type': 'application/json' },
  });
}
