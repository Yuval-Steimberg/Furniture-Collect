import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  projectName: string;
  role: string;
  inviterName: string;
  invitationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, projectName, role, inviterName, invitationId }: InvitationRequest = await req.json();

    const roleText = role === 'VIEWER' ? 'צופה' : role === 'WORKER' ? 'עובד' : 'מנהל פרויקט';
    const acceptUrl = `${Deno.env.get('SUPABASE_URL')}/accept-invitation?id=${invitationId}`;
    
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not found in environment');
      throw new Error('RESEND_API_KEY not configured');
    }
    
    // Log API key format (first 3 chars only for security)
    console.log('API key format:', RESEND_API_KEY.substring(0, 3) + '***');
    
    if (!RESEND_API_KEY.startsWith('re_')) {
      console.error('Invalid API key format - must start with re_');
      throw new Error('Invalid RESEND_API_KEY format');
    }

    // Send email using Resend API directly
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'מערכת תיעוד פינוי <onboarding@resend.dev>',
        to: [email],
        subject: `הזמנה לפרויקט: ${projectName}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">הוזמנת לפרויקט!</h1>
            <p style="font-size: 16px; color: #555;">
              שלום,<br><br>
              ${inviterName} הזמין אותך להצטרף לפרויקט <strong>${projectName}</strong>
              בתור <strong>${roleText}</strong>.
            </p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #666;">תפקיד: <strong>${roleText}</strong></p>
              <p style="margin: 10px 0 0 0; color: #666;">פרויקט: <strong>${projectName}</strong></p>
            </div>

            <a href="${acceptUrl}" 
               style="display: inline-block; background-color: #0066cc; color: white; 
                      padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                      margin: 20px 0; font-weight: bold;">
              קבל הזמנה
            </a>

            <p style="font-size: 14px; color: #999;">
              ההזמנה תפוג בעוד 7 ימים.<br>
              אם לא ביקשת הזמנה זו, ניתן להתעלם ממייל זה.
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
