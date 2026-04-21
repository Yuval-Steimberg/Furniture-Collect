import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, itemsSummary, projectsSummary } = await req.json();
    
    if (!question) {
      throw new Error('Question is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `You are an assistant for an item collection and recycling management system.
You have access to the following data about collected items:

${itemsSummary}

Projects Summary:
${projectsSummary}

Answer the following question in Hebrew based on the data provided.
Be concise and helpful. If you need to calculate CO2 savings, use these factors per kg of material:
- Wood: 0.5 kg CO2
- Metal: 2.5 kg CO2
- Plastic: 3.0 kg CO2
- Glass: 0.8 kg CO2
- Aluminum: 8.0 kg CO2
- Textile: 1.5 kg CO2
- Electrical: 2.0 kg CO2
- Other: 1.0 kg CO2

Question: ${question}

Provide a clear, concise answer in Hebrew.`;

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
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', errorText);
      throw new Error(`AI request failed: ${errorText}`);
    }

    const result = await response.json();
    const answer = result.choices[0].message.content;

    return new Response(
      JSON.stringify({ answer }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in ask-statistics-question:', error);
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
