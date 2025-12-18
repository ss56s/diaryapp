import React, { useEffect, useRef } from 'react';

interface CalendarStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const CalendarStrip: React.FC<CalendarStripProps> = ({ selectedDate, onSelectDate }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayStr = new Date().toISOString().split('T')[0];

  const generateDays = () => {
    const days = [];
    const today = new Date();
    // Increase range to cover more ground
    for (let i = -30; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const days = generateDays();

  // Scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      // Find the button element for the selected date
      const selectedEl = document.getElementById(`date-btn-${selectedDate}`);
      
      if (selectedEl) {
        const containerWidth = container.clientWidth;
        const elWidth = selectedEl.clientWidth;
        const elOffset = selectedEl.offsetLeft;
        
        // Calculate centered position:
        // Element Center = elOffset + elWidth/2
        // Container Center = containerWidth/2
        // Scroll Target = Element Center - Container Center
        const scrollLeft = elOffset + elWidth / 2 - containerWidth / 2;
        
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [selectedDate]);

  const formatDate = (date: Date) => {
    const d = date.getDate();
    const w = date.toLocaleDateString('zh-CN', { weekday: 'short' });
    return { d, w, full: date.toISOString().split('T')[0] };
  };

  const handleJumpToToday = () => {
    onSelectDate(todayStr);
  };

  return (
    <div className="sticky top-0 z-40 pt-4 pb-2 px-4 bg-background/80 backdrop-blur-md">
      <div className="glass rounded-[2rem] shadow-sm p-2 flex items-center gap-3">
        {/* Today Button (Circular) */}
        <button
          onClick={handleJumpToToday}
          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 border ${
             selectedDate === todayStr 
               ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105 border-primary' 
               : 'bg-white text-textMuted border-transparent hover:bg-slate-50'
          }`}
          title="回到今天"
        >
          <i className="fa-solid fa-crosshairs text-lg"></i>
        </button>

        {/* Vertical Separator */}
        <div className="w-px h-8 bg-slate-200/60"></div>

        {/* Scrollable Strip */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-x-auto no-scrollbar flex space-x-3 snap-x px-1 py-1 relative"
        >
          {days.map((dateObj, idx) => {
            const { d, w, full } = formatDate(dateObj);
            const isSelected = full === selectedDate;
            const isToday = full === todayStr;

            return (
              <button
                key={idx}
                id={`date-btn-${full}`}
                onClick={() => onSelectDate(full)}
                className={`snap-center flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-300 border ${
                  isSelected 
                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-110' 
                    : isToday
                      ? 'bg-white border-primary/30 text-primary font-semibold'
                      : 'bg-transparent border-transparent text-textMuted hover:bg-slate-100'
                }`}
              >
                <span className={`text-[9px] font-bold uppercase leading-none mb-0.5 ${isSelected ? 'text-white/80' : 'text-textMuted/70'}`}>
                  {isToday ? '今' : w}
                </span>
                <span className={`text-base font-bold leading-none ${isSelected ? 'text-white' : 'text-textMain'}`}>
                  {d}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarStrip;