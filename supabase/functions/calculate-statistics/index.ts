import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Item {
  description: string;
  quantity: number;
  material_category: string;
  item_type: string;
  collected: boolean;
  intended_for_collection: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items } = await req.json();
    
    if (!items || !Array.isArray(items)) {
      throw new Error('Items array is required');
    }

    console.log('Calculating statistics for items:', items.length);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const itemsSummary = items.map((item: Item) => 
      `${item.description} (כמות: ${item.quantity}, קטגוריה: ${item.material_category}, סוג: ${item.item_type})`
    ).join('\n');

    const prompt = `You are an environmental impact calculator for recycling and waste management.

Given the following list of items from an apartment evacuation, estimate:
1. Total weight in kilograms
2. CO2 emissions saved (in kg) by recycling/reusing these items instead of sending to landfill

Items:
${itemsSummary}

Rules for estimation:
- Furniture (wood): ~10-50kg per item, CO2 savings ~2-8 kg per item
- Appliances (electrical): ~15-100kg per item, CO2 savings ~5-20 kg per item  
- Glass items: ~1-5kg per item, CO2 savings ~0.5-2 kg per item
- Metal/Aluminum: ~2-20kg per item, CO2 savings ~8-15 kg per item
- Plastic items: ~0.5-5kg per item, CO2 savings ~1-3 kg per item
- Textiles: ~1-10kg per item, CO2 savings ~3-10 kg per item
- Small items: ~0.5-3kg per item, CO2 savings ~0.5-2 kg per item

Return ONLY a JSON object with this structure (no other text):
{
  "total_weight_kg": number,
  "co2_saved_kg": number
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', errorText);
      throw new Error(`AI calculation failed: ${errorText}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    console.log('AI response:', content);

    let stats;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        stats = JSON.parse(jsonMatch[0]);
      } else {
        stats = JSON.parse(content);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e, 'Content:', content);
      throw new Error('Failed to parse AI response');
    }

    console.log('Calculated statistics:', stats);

    return new Response(
      JSON.stringify(stats),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in calculate-statistics:', error);
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
