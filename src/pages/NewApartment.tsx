import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';

export default function NewApartment() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledBuilding = searchParams.get('building') || '';
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    building_number: prefilledBuilding,
    apartment_number: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('apartments')
        .insert([{
          project_id: projectId,
          ...formData,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('דירה נוספה בהצלחה');
      navigate(`/projects/${projectId}/apartments/${data.id}`);
    } catch (error: any) {
      toast.error('שגיאה בהוספת דירה');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="דירה חדשה"
        onBack={() => navigate(`/projects/${projectId}`)}
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-2xl">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">הוספת דירה חדשה</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="building" className="text-sm sm:text-base">
                  מספר בניין *
                  {prefilledBuilding && (
                    <span className="text-xs text-muted-foreground mr-2">(מולא אוטומטית - ניתן לשנות)</span>
                  )}
                </Label>
                <Input
                  id="building"
                  required
                  value={formData.building_number}
                  onChange={(e) => setFormData({ ...formData, building_number: e.target.value })}
                  className="h-11 sm:h-10 text-base sm:text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apartment" className="text-sm sm:text-base">מספר דירה *</Label>
                <Input
                  id="apartment"
                  required
                  value={formData.apartment_number}
                  onChange={(e) => setFormData({ ...formData, apartment_number: e.target.value })}
                  className="h-11 sm:h-10 text-base sm:text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm sm:text-base">הערות</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="text-base sm:text-sm"
                />
              </div>

              <Button type="submit" className="w-full h-11 sm:h-10 text-base sm:text-sm" disabled={loading}>
                {loading ? 'מוסיף...' : 'הוסף דירה'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
