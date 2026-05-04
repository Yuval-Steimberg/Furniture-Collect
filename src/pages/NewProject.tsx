import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';

export default function NewProject() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    developer_name: '',
    start_date: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([formData])
        .select()
        .single();

      if (error) throw error;

      toast.success('פרויקט נוצר בהצלחה');
      navigate(`/projects/${data.id}`);
    } catch (error: any) {
      toast.error('שגיאה ביצירת פרויקט');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="פרויקט חדש"
        onBack={() => navigate('/projects')}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>יצירת פרויקט חדש</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">שם הפרויקט *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">עיר *</Label>
                <Input
                  id="city"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="developer">שם היזם *</Label>
                <Input
                  id="developer"
                  required
                  value={formData.developer_name}
                  onChange={(e) => setFormData({ ...formData, developer_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">תאריך התחלה *</Label>
                <Input
                  id="start_date"
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'יוצר...' : 'צור פרויקט'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}