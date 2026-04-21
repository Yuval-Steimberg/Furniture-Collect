import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const invitationId = searchParams.get('id');

  useEffect(() => {
    acceptInvitation();
  }, []);

  const acceptInvitation = async () => {
    try {
      if (!invitationId) {
        setStatus('error');
        setMessage('הזמנה לא תקינה');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(window.location.href);
        navigate(`/auth?returnUrl=${returnUrl}`);
        return;
      }

      // Call the accept invitation function
      const { data, error } = await supabase.rpc('accept_project_invitation', {
        invitation_id: invitationId
      });

      if (error) throw error;

      if (data) {
        setStatus('success');
        setMessage('הצטרפת בהצלחה לפרויקט!');
        toast.success('הצטרפת בהצלחה לפרויקט');
        
        // Redirect to projects after 2 seconds
        setTimeout(() => {
          navigate('/projects');
        }, 2000);
      } else {
        setStatus('error');
        setMessage('ההזמנה אינה תקפה או שפג תוקפה');
      }
    } catch (error: any) {
      console.error(error);
      setStatus('error');
      setMessage('שגיאה בקבלת ההזמנה');
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">קבלת הזמנה לפרויקט</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'loading' && (
            <div className="py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">מעבד הזמנה...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-8">
              <CheckCircle className="h-12 w-12 mx-auto text-success mb-4" />
              <p className="text-lg font-medium mb-2">{message}</p>
              <p className="text-sm text-muted-foreground">מעביר אותך לעמוד הפרויקטים...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8">
              <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium mb-4">{message}</p>
              <Button onClick={() => navigate('/projects')}>
                חזור לעמוד הפרויקטים
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
