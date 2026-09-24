/** Server-only: streams a Responses API call and returns the final text. */
export async function streamResponseText(input: unknown[], opts?: { json?: boolean }) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("خدمة الذكاء الاصطناعي غير مهيأة");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      ...(opts?.json ? { text: { format: { type: "json_object" } } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("طلبات كثيرة، حاول بعد قليل");
  if (res.status === 402) throw new Error("نفد رصيد الذكاء الاصطناعي في مساحة العمل");
  if (!res.ok || !res.body) throw new Error("تعذر الاتصال بخدمة الذكاء الاصطناعي");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let summary = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: string };
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.reasoning_summary_text.delta") summary += ev.delta ?? "";
      } catch {
        /* partial frame */
      }
    }
  }
  return text.trim() || summary.trim();
}
