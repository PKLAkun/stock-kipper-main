import { getRepository } from '@/lib/db';
import { handleApiError, jsonOk } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endpoint ini PUBLIC (tidak perlu login) — hanya return nama operator untuk dropdown
export async function GET() {
  try {
    const repo = getRepository();
    const operators = await repo.listOperators();
    return jsonOk({ operators });
  } catch (err) {
    return handleApiError(err);
  }
}