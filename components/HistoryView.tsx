
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getAllTimelineItems, deleteTimelineItem, removePendingDelete } from '../services/storageService';
import { deleteLogAction } from '../app/actions';
import ConfirmModal from './ConfirmModal';
import { TimelineItem, CategoryType, CATEGORIES, Attachment } from '../types';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

interface HistoryViewProps {
  onImageClick: (url: string) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint text-orange-500';
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv')) return 'fa-file-excel text-emerald-500';
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar') || mimeType.includes('rar')) return 'fa-file-zipper text-amber-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word text-blue-500';
  if (mimeType.includes('text') || mimeType.includes('txt')) return 'fa-file-lines text-slate-500';
  return 'fa-file text-slate-400';
};

const getDriveFileId = (url: string) => {
  if (!url || !url.includes('drive.google.com')) return null;
  try {
    const pathMatch = url.match(/\/d\/([^/]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    if (url.includes('id=')) {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('id');
    }
  } catch (e) {
    console.error("URL parse error", e);
  }
  return null;
};

const HistoryView: React.FC<HistoryViewProps> = ({ onImageClick }) => {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  
  // Filter State
  const [filterCategory, setFilterCategory] = useState<CategoryType | 'all'>('all');

  // Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  // Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Touch tracking
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    setItems(getAllTimelineItems());
  }, []);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const days: (string | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentYear, currentMonth, i);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      days.push(`${d.getFullYear()}-${m}-${day}`);
    }
    return days;
  }, [currentYear, currentMonth]);

  const daysWithLogs = useMemo(() => new Set(items.map(i => i.date)), [items]);

  const selectedItems = useMemo(() => {
    let filtered = items.filter(i => i.date === selectedDate);
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(i => i.category === filterCategory);
    }

    return filtered.sort((a, b) => a.timestamp - b.timestamp);
  }, [items, selectedDate, filterCategory]);

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const initiateDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      await deleteTimelineItem(itemToDelete);
      const item = items.find(i => i.id === itemToDelete);
      const deleteDate = item ? item.date : selectedDate;

      deleteLogAction(deleteDate, itemToDelete).then(res => {
         if (res.success) {
           removePendingDelete(itemToDelete);
         }
      });

      setItems(getAllTimelineItems());
      setItemToDelete(null);
    }
  };

  const handleDownload = async (att: Attachment) => {
    if (downloadingId) return;

    const fileId = getDriveFileId(att.url);
    if (!fileId) {
       window.open(att.url, '_blank');
       return;
    }

    setDownloadingId(att.id);
    const apiUrl = `/api/proxy-download?fileId=${fileId}&filename=${encodeURIComponent(att.name)}&contentType=${encodeURIComponent(att.type)}`;
    
    const link = document.createElement('a');
    link.href = apiUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
        document.body.removeChild(link);
        setDownloadingId(null);
    }, 1500);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - touchStartY.current;
    
    if (diff < -30) {
      setIsCalendarExpanded(false);
    } else if (diff > 30) {
      setIsCalendarExpanded(true);
    } else if (Math.abs(diff) < 5) {
      setIsCalendarExpanded(!isCalendarExpanded);
    }
    
    touchStartY.current = null;
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Calendar Header Container */}
      <div className="flex-shrink-0 bg-surface shadow-soft rounded-b-[2.5rem] z-20 relative flex flex-col transition-all duration-300">
        
        {/* Header (Always Visible) */}
        <div className="pt-12 pb-2 px-6 flex items-center justify-between relative z-30">
          <div className="relative">
            <h2 className="text-2xl font-bold text-textMain tracking-tight flex items-center gap-2">
               {viewDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
               <i className="fa-solid fa-caret-down text-sm text-textMuted"></i>
            </h2>
            <input 
              type="month" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => {
                if(e.target.value) {
                  const [y, m] = e.target.value.split('-');
                  setViewDate(new Date(parseInt(y), parseInt(m)-1, 1));
                }
              }}
            />
          </div>

          <div className="flex space-x-2 relative z-30">
            <button 
              onClick={() => setViewDate(new Date(currentYear, currentMonth - 1, 1))}
              className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 text-textMuted hover:bg-white hover:shadow-md transition-all flex items-center justify-center active:scale-95"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <button 
              onClick={() => setViewDate(new Date(currentYear, currentMonth + 1, 1))}
              className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 text-textMuted hover:bg-white hover:shadow-md transition-all flex items-center justify-center active:scale-95"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>

        {/* Collapsible Grid Area */}
        <div 
          className={`px-4 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isCalendarExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="grid grid-cols-7 mb-2 mt-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-textMuted/60 uppercase tracking-widest">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-3 pb-2">
            {calendarDays.map((dateStr, idx) => {
              if (!dateStr) return <div key={`empty-${idx}`} />;
              
              const isSelected = dateStr === selectedDate;
              const hasData = daysWithLogs.has(dateStr);
              const dayNumber = parseInt(dateStr.split('-')[2]);
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div key={dateStr} className="flex flex-col items-center justify-center">
                  <button
                    onClick={() => handleDateClick(dateStr)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 relative group ${
                      isSelected 
                        ? 'bg-primary text-white shadow-lg shadow-primary/40 scale-105' 
                        : isToday 
                          ? 'bg-primary/10 text-primary' 
                          : 'text-textMain hover:bg-slate-50'
                    }`}
                  >
                    {dayNumber}
                    {hasData && !isSelected && (
                      <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-secondary"></span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drag Handle with Touch Events */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="button"
          aria-label="Toggle Calendar"
          className="w-full flex flex-col items-center justify-center h-10 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-grab touch-pan-y relative z-20"
        >
          <div className="w-12 h-1 bg-slate-300 rounded-full"></div>
          
          <div className={`text-slate-300 text-[10px] transition-transform duration-300 mt-1 ${isCalendarExpanded ? 'rotate-180' : ''}`}>
             <i className="fa-solid fa-chevron-down"></i>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-6 py-3 overflow-x-auto no-scrollbar flex-shrink-0 bg-background/95 backdrop-blur-sm z-10">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
            filterCategory === 'all'
              ? 'bg-slate-800 border-slate-800 text-white shadow-md'
              : 'bg-white border-slate-200 text-textMuted hover:bg-slate-50'
          }`}
        >
          全部
        </button>
        {Object.values(CATEGORIES).map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              filterCategory === cat.id
                ? `${cat.color} border-transparent text-white shadow-md`
                : 'bg-white border-slate-200 text-textMuted hover:bg-slate-50'
            }`}
          >
            {filterCategory === cat.id && <i className={`fa-solid ${cat.icon} text-[10px]`}></i>}
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-32">
        <div className="flex items-center gap-3 mb-6">
           <div className="w-1 h-6 bg-primary rounded-full"></div>
           <h3 className="text-lg font-bold text-textMain">
             {new Date(selectedDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })}
           </h3>
           <span className="text-xs font-semibold text-textMuted bg-slate-100 px-2 py-1 rounded-lg">
             {selectedItems.length}
           </span>
        </div>

        {selectedItems.length === 0 ? (
          <div className="text-center py-10 opacity-50">
             <i className="fa-regular fa-folder-open text-4xl mb-2 text-textMuted"></i>
             <p className="text-sm">无记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedItems.map((item) => {
              const catConfig = item.category ? CATEGORIES[item.category] : null;

              return (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 animate-slide-up flex gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0 w-12">
                    <span className="text-xs font-bold text-textMuted font-mono">{item.timeLabel}</span>
                    <div className="w-px h-full bg-slate-100 my-1"></div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                       <div className="flex flex-col gap-1 w-full">
                          <p className="text-textMain text-[15px] leading-relaxed whitespace-pre-wrap break-words">{item.content}</p>
                          {catConfig && (
                            <span className={`inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-100`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${catConfig.color}`}></span>
                              <span className={`text-[10px] font-medium ${catConfig.textClass}`}>{catConfig.label}</span>
                            </span>
                          )}
                       </div>
                      <button 
                        onClick={() => initiateDelete(item.id)}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 p-1.5 -mt-1 -mr-1 transition-colors"
                        title="删除记录"
                      >
                        <i className="fa-regular fa-trash-can text-base"></i>
                      </button>
                    </div>
                    
                    {item.attachments.length > 0 && (
                       <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
                         {item.attachments.map(att => {
                           const isImg = att.type.startsWith('image/');
                           if (isImg) {
                             return (
                               <img 
                                  key={att.id} 
                                  src={att.url} 
                                  className="w-16 h-16 rounded-xl object-cover shadow-sm border border-slate-50 cursor-zoom-in active:scale-95 transition-transform" 
                                  onClick={() => onImageClick(att.url)}
                               />
                             );
                           } else {
                             const isDownloading = downloadingId === att.id;
                             return (
                               <div 
                                 key={att.id} 
                                 onClick={() => handleDownload(att)}
                                 className={`w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center gap-1 shadow-sm transition-colors relative cursor-pointer ${isDownloading ? 'opacity-80 pointer-events-none' : 'hover:bg-slate-100'}`}
                               >
                                  <div className="absolute top-1 right-1 text-[8px] text-slate-300">
                                      {isDownloading ? <i className="fa-solid fa-circle-notch fa-spin text-primary"></i> : <i className="fa-solid fa-download"></i>}
                                  </div>
                                  <i className={`fa-solid ${getFileIcon(att.type)} text-xl`}></i>
                                  <span className="text-[9px] text-textMuted font-bold uppercase truncate w-full text-center px-1">
                                      {att.name.split('.').pop()}
                                  </span>
                               </div>
                             );
                           }
                         })}
                       </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="删除记录?"
        message="确定要删除这条记录吗？此操作无法撤销。"
      />
    </div>
  );
};

export default HistoryView;
