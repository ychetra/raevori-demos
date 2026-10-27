import { store } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const { id } = store.create();
  return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
