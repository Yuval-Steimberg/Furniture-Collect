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

    // Step 2: Parse with faster Gemini model
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const parsePrompt = `Parse this Hebrew apartment evacuation inventory into JSON array. Rules:
1. Quantity: extract numbers (2 כסאות=2), default 1
2. Location: extract (בסלון, במטבח, etc), default ""
3. intended_for_collection: false if "לא לקחת", else true
4. item_type: furniture/appliance/textile/small_item/other
5. material_category: glass/aluminum/wood/plastic/metal/textile/electrical/other
6. description: Hebrew, concise

Text: ${transcribedText}

Return ONLY valid JSON array, no markdown.`;

    const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
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
    const parsedContent = parseResult.choices[0].message.content;

    let items: ParsedItem[];
    try {
      const jsonMatch = parsedContent.match(/\[[\s\S]*\]/);
      items = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(parsedContent);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      throw new Error('Failed to parse AI response');
    }

    const totalTime = Date.now() - startTime;
    console.log(`Successfully processed ${items.length} items in ${totalTime}ms`);

    return new Response(
      JSON.stringify({ 
        transcription: transcribedText,
        items: items,
        processingTime: totalTime
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
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