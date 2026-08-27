"use client";

import { Button } from "@/components/ui/button";

interface DateRangePresetsProps {
  onSelectRange: (start: string, end: string) => void;
}

export function DateRangePresets({ onSelectRange }: Readonly<DateRangePresetsProps>) {
  const handlePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    
    if (days === 0) {
      // Today
    } else if (days === 1) {
      // Yesterday
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (days > 1) {
      // Last X days
      start.setDate(start.getDate() - days);
    }

    onSelectRange(
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10)
    );
  };

  const handleThisMonth = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    onSelectRange(
      start.toISOString().slice(0, 10),
      today.toISOString().slice(0, 10)
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => handlePreset(0)}>
        Today
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handlePreset(1)}>
        Yesterday
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handlePreset(7)}>
        Last 7 Days
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handlePreset(30)}>
        Last 30 Days
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={handleThisMonth}>
        This Month
      </Button>
    </div>
  );
}
