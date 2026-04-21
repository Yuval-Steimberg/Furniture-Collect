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

  try {
    const { text } = await req.json();
    
    if (!text) {
      throw new Error('No text provided');
    }

    console.log('Parsing text:', text);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const parsePrompt = `You are a Hebrew-speaking assistant helping parse text descriptions of apartment items during evacuation documentation.

Parse the following Hebrew text into a JSON array of items. For each item, extract:

Rules:
1. If quantity is mentioned (e.g., "2 כסאות", "שלושה מקררים"), use that number. Otherwise default to 1.
2. If location is mentioned (e.g., "בסלון", "במטבח", "בחדר שינה", "במרפסת"), extract it. Otherwise leave empty.
3. If "לא לקחת" or similar negation is mentioned, set intended_for_collection to false. Otherwise true.
4. Infer item_type from: furniture, appliance, textile, small_item, other
5. Infer material_category from: glass, aluminum, wood, plastic, metal, textile, electrical, other
6. Keep description in Hebrew, concise and cleaned up

If you cannot understand an item at all, return:
{
  "description": "פריט לא זוהה – ערוך ידנית",
  "quantity": 1,
  "location": "",
  "intended_for_collection": true,
  "item_type": "other",
  "material_category": "other"
}

Text to parse:
${text}

Return ONLY a valid JSON array, no other text.`;

    const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: parsePrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error('Parse error:', errorText);
      throw new Error(`Parsing failed: ${errorText}`);
    }

    const parseResult = await parseResponse.json();
    const parsedContent = parseResult.choices[0].message.content;
    
    console.log('AI parsed content:', parsedContent);

    let items: ParsedItem[];
    try {
      const jsonMatch = parsedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      } else {
        items = JSON.parse(parsedContent);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e, 'Content:', parsedContent);
      throw new Error('Failed to parse AI response into valid JSON');
    }

    console.log('Successfully parsed items:', items);

    return new Response(
      JSON.stringify({ items: items }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in parse-text-items:', error);
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
