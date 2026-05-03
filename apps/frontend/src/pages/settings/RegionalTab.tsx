import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'Day/Month/Year (02/01/2024)', example: '02 Jan 2024' },
  { value: 'MM/DD/YYYY', label: 'Month/Day/Year (01/02/2024)', example: '02 Jan 2024' },
  { value: 'YYYY-MM-DD', label: 'Year-Month-Day (2024-01-02)', example: '02 Jan 2024' },
];

const RegionalTab = () => {
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem('pf_date_format');
    if (saved) setDateFormat(saved);
  }, []);

  const handleSaveFormat = (value: string) => {
    setDateFormat(value);
    localStorage.setItem('pf_date_format', value);
    toast({
      title: 'Settings saved',
      description: `Date format updated to ${value}.`,
    });
  };

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-foreground">Regional Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how dates and numbers are displayed and parsed.
          </p>
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Date & Time</CardTitle>
              </div>
              <CardDescription>
                This format is used for both displaying dates and parsing uploaded files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date-format">Standard Date Format</Label>
                <Select value={dateFormat} onValueChange={handleSaveFormat}>
                  <SelectTrigger id="date-format" className="w-full bg-muted border-border">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="focus:bg-accent">
                        <div className="flex flex-col">
                          <span className="font-medium">{f.label}</span>
                          <span className="text-[10px] text-muted-foreground">Example: {f.example}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-2 italic">
                  Note: If your Excel files use a different format than the one selected above, 
                  days and months may be swapped during upload.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50 backdrop-blur-sm opacity-50">
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Localization</CardTitle>
              </div>
              <CardDescription>
                Currency and number formatting (coming soon).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between py-2 border-t border-border/50">
                <span className="text-sm">Currency</span>
                <span className="text-sm font-mono text-muted-foreground">IDR (Rp)</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-border/50">
                <span className="text-sm">Number grouping</span>
                <span className="text-sm font-mono text-muted-foreground">1.000.000,00</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RegionalTab;
