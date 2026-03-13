// apps/web/app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  revalidatePath("/");
  revalidatePath("/awards");
  revalidatePath("/alerts");
  revalidatePath("/runs");

  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
