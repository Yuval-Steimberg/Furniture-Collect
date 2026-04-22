// parse-text-items — extract structured items from free-text Hebrew input.
//
// Supports either ANTHROPIC_API_KEY (preferred, native Claude Messages API)
// or LOVABLE_API_KEY (OpenAI-compatible gateway fallback).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedItem {
  description: string;
  quantity: number;
  location: string;
  intended_for_collection: boolean;
  item_type: string;
  material_category: string;
}

const PARSE_PROMPT = (text: string) => `You are a Hebrew-speaking assistant helping parse text descriptions of apartment items during evacuation documentation.

Parse the following Hebrew text into a JSON array of items. For each item extract:
- description (Hebrew, short)
- quantity (integer, default 1)
- location (e.g. סלון, מטבח, חדר שינה, מרפסת; empty string if unclear)
- intended_for_collection (false if "לא לקחת" or similar negation; else true)
- item_type (one of: furniture, appliance, textile, small_item, other)
- material_category (one of: glass, aluminum, wood, plastic, metal, textile, electrical, other)

If you cannot understand an item at all, return:
{"description":"פריט לא זוהה – ערוך ידנית","quantity":1,"location":"","intended_for_collection":true,"item_type":"other","material_category":"other"}

Text to parse:
${text}

Return ONLY a valid JSON array, no other text.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text) throw new Error("No text provided");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY   = Deno.env.get("LOVABLE_API_KEY");
    if (!ANTHROPIC_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY (or LOVABLE_API_KEY) not configured");
    }

    let rawContent = "";
    if (ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1500,
          messages: [{ role: "user", content: PARSE_PROMPT(text) }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const j = await r.json();
      rawContent = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    } else {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: PARSE_PROMPT(text) }],
          temperature: 0.3,
        }),
      });
      if (!r.ok) throw new Error(`Gateway ${r.status}: ${await r.text()}`);
      const j = await r.json();
      rawContent = j?.choices?.[0]?.message?.content ?? "";
    }

    // Robust JSON extraction — strip markdown fences, grab first [...] block.
    const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    let items: ParsedItem[];
    try {
      items = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse JSON. Content:", rawContent);
      throw new Error("Failed to parse AI response into valid JSON");
    }

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Error in parse-text-items:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
