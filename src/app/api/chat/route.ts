import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let question = "";
  let activeLayers: string[] = [];
  try {
    const body = await req.json();
    question = (body?.question ?? "").toString().slice(0, 500);
    if (Array.isArray(body?.activeLayers)) {
      activeLayers = body.activeLayers
        .filter((x: unknown): x is string => typeof x === "string")
        .slice(0, 24);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!question.trim()) {
    return NextResponse.json({ error: "Empty question" }, { status: 400 });
  }
  try {
    const answer = await answerQuestion(question, activeLayers);
    return NextResponse.json(answer);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to build grounded answer", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
