"use client";

import { Button } from "@/components/ui/button";

interface DateRangePresetsProps {
  onSelectRange: (start: string, end: string) => void;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      formatLocalDate(start),
      formatLocalDate(end)
    );
  };

  const handleThisMonth = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    onSelectRange(
      formatLocalDate(start),
      formatLocalDate(today)
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
