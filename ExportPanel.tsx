/**
 * ExportPanel - Highly visible export options for mobile and desktop
 * Supports CSV, Excel, and Executive PDF reports
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  File, 
  Loader2,
  ChevronDown,
  FileBarChart
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { generateExecutiveReport } from '@/lib/executiveReportPDF';

interface ExportPanelProps {
  items: any[];
  projects: any[];
  stats?: {
    totalItems: number;
    collected: number;
    totalWeight: number;
    totalValue: number;
  };
  projectName?: string;
  projectAddress?: string;
  variant?: 'full' | 'compact' | 'dropdown';
  className?: string;
}

export function ExportPanel({
  items,
  projects,
  stats,
  projectName = 'כל הפרויקטים',
  projectAddress = '',
  variant = 'full',
  className = '',
}: ExportPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  // Build stats object for export functions
  const buildExportStats = () => {
    const totalItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    const collected = items.filter(i => i.collected).reduce((sum, i) => sum + (i.quantity || 1), 0);
    const pending = items.filter(i => !i.collected && i.intended_for_collection).reduce((sum, i) => sum + (i.quantity || 1), 0);
    const totalWeight = items.reduce((sum, i) => sum + ((i.estimated_weight_kg || 0) * (i.quantity || 1)), 0);
    
    // Calculate material breakdown
    const materialCounts: Record<string, { count: number; weight: number }> = {};
    items.forEach(item => {
      const cat = item.material_category || 'other';
      if (!materialCounts[cat]) materialCounts[cat] = { count: 0, weight: 0 };
      materialCounts[cat].count += item.quantity || 1;
      materialCounts[cat].weight += (item.estimated_weight_kg || 0) * (item.quantity || 1);
    });

    const CO2_FACTORS: Record<string, number> = {
      wood: 0.5, metal: 2.5, plastic: 3.0, glass: 0.8,
      aluminum: 8.0, textile: 1.5, electrical: 2.0, other: 1.0,
    };

    const materialChartData = Object.entries(materialCounts).map(([name, data]) => ({
      name,
      rawName: name,
      weight: data.weight,
      count: data.count,
      percentage: totalItems > 0 ? (data.count / totalItems) * 100 : 0,
      co2: data.weight * (CO2_FACTORS[name] || 1),
    }));

    const totalCO2 = materialChartData.reduce((sum, m) => sum + m.co2, 0);

    return {
      totalItems,
      collected,
      pending,
      totalWeight,
      totalCO2,
      materialChartData,
      items,
    };
  };

  const handleExportCSV = () => {
    try {
      const exportStats = buildExportStats();
      exportToCSV(exportStats, `items_export_${new Date().toISOString().split('T')[0]}`);
      toast.success('קובץ CSV הורד בהצלחה');
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error('שגיאה בייצוא CSV');
    }
  };

  const handleExportExcel = async () => {
    setExporting('excel');
    try {
      const exportStats = buildExportStats();
      await exportToExcel(exportStats, projects, `items_export_${new Date().toISOString().split('T')[0]}`);
      toast.success('קובץ Excel הורד בהצלחה');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('שגיאה בייצוא Excel');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      const exportStats = buildExportStats();
      await exportToPDF(exportStats, projects, 'all', `items_report_${new Date().toISOString().split('T')[0]}`);
      toast.success('קובץ PDF הורד בהצלחה');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('שגיאה בייצוא PDF');
    } finally {
      setExporting(null);
    }
  };

  const handleExportExecutive = async () => {
    setExporting('executive');
    try {
      await generateExecutiveReport({
        projectName,
        projectAddress,
        items,
      });
      toast.success('דוח מנהלים הורד בהצלחה');
    } catch (err) {
      console.error('Executive report failed:', err);
      toast.error('שגיאה ביצירת דוח מנהלים');
    } finally {
      setExporting(null);
    }
  };

  // Dropdown variant - compact for headers
  if (variant === 'dropdown') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className={`gap-2 ${className}`}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">ייצוא</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>בחר פורמט</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
            <File className="h-4 w-4" />
            CSV - נתונים גולמיים
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportExcel} disabled={!!exporting} className="gap-2">
            {exporting === 'excel' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Excel - גיליונות מרובים
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportPDF} disabled={!!exporting} className="gap-2">
            {exporting === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            PDF - סיכום בסיסי
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExportExecutive} disabled={!!exporting} className="gap-2 text-primary font-medium">
            {exporting === 'executive' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileBarChart className="h-4 w-4" />
            )}
            📊 דוח מנהלים מקצועי
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Compact variant - row of buttons
  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
          <File className="h-4 w-4" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!!exporting} className="gap-1.5">
          {exporting === 'excel' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Excel</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!!exporting} className="gap-1.5">
          {exporting === 'pdf' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">PDF</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportExecutive} disabled={!!exporting} className="gap-1.5 font-medium">
          {exporting === 'executive' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileBarChart className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">דוח מנהלים</span>
        </Button>
      </div>
    );
  }

  // Full variant - card with all options
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            ייצוא נתונים
          </h3>
          <span className="text-sm text-muted-foreground">
            {items.length} פריטים
          </span>
        </div>

        {/* Mobile: Stack vertically */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* CSV */}
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="flex flex-col h-auto py-4 gap-2"
          >
            <File className="h-6 w-6 text-muted-foreground" />
            <div className="text-center">
              <div className="font-medium">CSV</div>
              <div className="text-xs text-muted-foreground">נתונים גולמיים</div>
            </div>
          </Button>

          {/* Excel */}
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={!!exporting}
            className="flex flex-col h-auto py-4 gap-2"
          >
            {exporting === 'excel' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
            )}
            <div className="text-center">
              <div className="font-medium">Excel</div>
              <div className="text-xs text-muted-foreground">גיליונות מרובים</div>
            </div>
          </Button>

          {/* PDF Basic */}
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={!!exporting}
            className="flex flex-col h-auto py-4 gap-2"
          >
            {exporting === 'pdf' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <FileText className="h-6 w-6 text-red-600" />
            )}
            <div className="text-center">
              <div className="font-medium">PDF</div>
              <div className="text-xs text-muted-foreground">סיכום בסיסי</div>
            </div>
          </Button>

          {/* Executive Report - Highlighted */}
          <Button
            variant="default"
            onClick={handleExportExecutive}
            disabled={!!exporting}
            className="flex flex-col h-auto py-4 gap-2 bg-primary hover:bg-primary/90"
          >
            {exporting === 'executive' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <FileBarChart className="h-6 w-6" />
            )}
            <div className="text-center">
              <div className="font-medium">דוח מנהלים</div>
              <div className="text-xs opacity-80">מקצועי</div>
            </div>
          </Button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          דוח המנהלים כולל: תקציר מנהלים, גרפים, תובנות, והשפעה סביבתית
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Sticky Export Bar - Fixed at bottom for mobile
 */
export function StickyExportBar({
  items,
  projects,
  projectName,
  projectAddress,
}: Omit<ExportPanelProps, 'variant' | 'className'>) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportExecutive = async () => {
    setExporting('executive');
    try {
      await generateExecutiveReport({
        projectName: projectName || 'פרויקט',
        projectAddress: projectAddress || '',
        items,
      });
      toast.success('דוח מנהלים הורד בהצלחה');
    } catch (err) {
      console.error('Executive report failed:', err);
      toast.error('שגיאה ביצירת דוח מנהלים');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 z-50 sm:hidden">
      <div className="flex gap-2">
        <ExportPanel
          items={items}
          projects={projects}
          projectName={projectName}
          projectAddress={projectAddress}
          variant="dropdown"
          className="flex-1"
        />
        <Button
          onClick={handleExportExecutive}
          disabled={!!exporting}
          className="flex-1 gap-2"
        >
          {exporting === 'executive' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileBarChart className="h-4 w-4" />
          )}
          דוח מנהלים
        </Button>
      </div>
    </div>
  );
}
