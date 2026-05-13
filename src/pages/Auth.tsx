import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Circle } from 'lucide-react';

function translateAuthError(msg: string): string {
  if (!msg) return 'שגיאה לא ידועה';
  const m = msg.toLowerCase();
  if (m.includes('rate limit') || m.includes('rate_limit') || m.includes('over_email_send_rate_limit'))
    return 'הגעת למגבלת שליחת אימיילים — נסה שוב בעוד שעה, או בקש מהמנהל לכבות אישור אימייל בהגדרות Supabase.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already registered'))
    return 'כתובת האימייל כבר רשומה — נסה להתחבר.';
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return 'אימייל או סיסמה שגויים.';
  if (m.includes('email not confirmed'))
    return 'האימייל טרם אומת — בדוק את תיבת הדואר שלך ולחץ על קישור האישור.';
  if (m.includes('password should be at least'))
    return 'הסיסמה חייבת להכיל לפחות 6 תווים.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'כתובת האימייל אינה תקינה.';
  if (m.includes('signup is disabled') || m.includes('signups not allowed'))
    return 'ההרשמה סגורה כרגע — פנה למנהל המערכת.';
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'בעיית חיבור — בדוק את החיבור לאינטרנט ונסה שוב.';
  return msg;
}

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session) {
        navigate('/projects');
      }
    });
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === 'SIGNED_IN') {
        navigate('/projects');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;

      // If email confirmation is disabled in Supabase (recommended for internal tools),
      // sign in immediately so the user doesn't have to wait for an email.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) {
        toast.success('ברוך הבא! החשבון נוצר בהצלחה.');
        // onAuthStateChange will navigate to /projects
      } else {
        toast.success('החשבון נוצר! בדוק את האימייל שלך לאישור ולאחר מכן התחבר.');
      }
    } catch (error: any) {
      toast.error(translateAuthError(error.message));
    } finally {
      setLoading(false);
    }
  };
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      toast.success('מתחבר...');
    } catch (error: any) {
      toast.error(translateAuthError(error.message));
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <Circle className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">JAS - Just A Second</CardTitle>
          <CardDescription>התחברות למערכת</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" dir="rtl">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">התחברות</TabsTrigger>
              <TabsTrigger value="signup">הרשמה</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">דוא"ל</Label>
                  <Input id="signin-email" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">סיסמה</Label>
                  <Input id="signin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'מתחבר...' : 'התחבר'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">שם מלא</Label>
                  <Input id="signup-name" type="text" value={name} onChange={e => setName(e.target.value)} required dir="rtl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">דוא"ל</Label>
                  <Input id="signup-email" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">סיסמה</Label>
                  <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'נרשם...' : 'הרשם'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
}