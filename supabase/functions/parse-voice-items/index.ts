import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedItem {
  description: string;
  quantity: number;
  location: string;
  intended_for_collection: boolean;
  item_type: string;
  material_category: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { audio } = await req.json();
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    const audioSize = Math.round(audio.length * 0.75 / 1024); // Approximate KB
    console.log(`Audio received: ~${audioSize}KB`);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Fast base64 decode
    const binaryString = atob(audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Prepare form data
    const formData = new FormData();
    const blob = new Blob([bytes], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'he');
    formData.append('response_format', 'json'); // Fastest response format

    const transcribeStart = Date.now();
    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error('Transcription error:', errorText);
      throw new Error(`Transcription failed: ${errorText}`);
    }

    const transcriptionResult = await transcriptionResponse.json();
    const transcribedText = transcriptionResult.text;
    
    console.log(`Transcribed in ${Date.now() - transcribeStart}ms:`, transcribedText);

    // Step 2: Parse — prefer Anthropic native, fall back to Lovable gateway
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LOVABLE_API_KEY   = Deno.env.get('LOVABLE_API_KEY');
    if (!ANTHROPIC_API_KEY && !LOVABLE_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY (or LOVABLE_API_KEY) is not configured');
    }

    // Ask Claude to either extract items OR classify the utterance as a
    // voice *command* ("סמן את כל הכיסאות כנאספו", "צור דוח לבניין 2").
    const parsePrompt = `You receive Hebrew speech from a worker using an apartment-evacuation inventory app.

First classify the utterance:
  - "items":   the user is describing items present (chairs, sofa, refrigerator, etc.)
  - "command": the user is issuing an app action (mark as collected, delete, generate report, navigate, etc.)
  - "unknown": can't tell

If "items" → return:
{"kind":"items","items":[{description, quantity, location, intended_for_collection, item_type, material_category}, ...]}

Where:
- quantity: extract numbers (2 כסאות=2), default 1
- location: בסלון, במטבח, בחדר שינה, etc., default ""
- intended_for_collection: false if "לא לקחת" / similar; else true
- item_type: furniture/appliance/textile/small_item/other
- material_category: glass/aluminum/wood/plastic/metal/textile/electrical/other
- description: Hebrew, concise

If "command" → return:
{"kind":"command","action":"<one of: mark_all_collected | mark_all_not_collected | delete_all_in_location | generate_report | go_to_statistics | unknown>","filter":{"location":"<optional>"}}

Utterance:
"""${transcribedText}"""

Return ONLY valid JSON, no markdown, no commentary.`;

    let parsedContent = '';
    if (ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1500,
          messages: [{ role: 'user', content: parsePrompt }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic parse failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      parsedContent = j?.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
    } else {
      const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [{ role: 'user', content: parsePrompt }],
        }),
      });
      if (!parseResponse.ok) {
        const errorText = await parseResponse.text();
        console.error('Parse error:', errorText);
        throw new Error(`Parsing failed: ${errorText}`);
      }
      const parseResult = await parseResponse.json();
      parsedContent = parseResult.choices[0].message.content;
    }

    // Parse Claude's response — supports the new {kind, items|action} shape
    // as well as the legacy bare array.
    let items: ParsedItem[] = [];
    let kind: string = "items";
    let command: Record<string, unknown> | null = null;
    try {
      const cleaned = parsedContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      const parsedObj = JSON.parse(cleaned);
      if (parsedObj && typeof parsedObj === "object" && !Array.isArray(parsedObj)) {
        kind = parsedObj.kind ?? "items";
        if (kind === "items" && Array.isArray(parsedObj.items)) items = parsedObj.items;
        else if (kind === "command") command = parsedObj;
      } else if (Array.isArray(parsedObj)) {
        items = parsedObj;
      }
    } catch (_e) {
      // Last-ditch: extract the first [...] block from the raw text
      try {
        const jsonMatch = parsedContent.match(/\[[\s\S]*\]/);
        items = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch (e2) {
        console.error("Failed to parse JSON. Content:", parsedContent);
        throw new Error("Failed to parse AI response");
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`parse-voice-items kind=${kind} items=${items.length} ms=${totalTime}`);

    return new Response(
      JSON.stringify({
        transcription: transcribedText,
        kind,
        items,
        command,
        processingTime: totalTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (error) {
    console.error('Error in parse-voice-items:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});