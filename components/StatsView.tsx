
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getAllTimelineItems, saveAIReport, getLatestReportForRange } from '../services/storageService';
import { generateWeeklySummary } from '../services/geminiService';
import { TimelineItem, CATEGORIES, CategoryType, AIReport, WeeklySummary, Attachment } from '../types';

declare global {
  interface Window {
    Chart: any;
  }
}

interface StatsViewProps {
  onImageClick: (url: string) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint text-orange-500';
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv')) return 'fa-file-excel text-emerald-500';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'fa-file-zipper text-amber-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word text-blue-500';
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

const StatsView: React.FC<StatsViewProps> = ({ onImageClick }) => {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [anchorDate, setAnchorDate] = useState(new Date()); 
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [currentReport, setCurrentReport] = useState<AIReport | null>(null);
  
  // Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(getAllTimelineItems());
  }, []);

  const toDateKey = (d: Date) => {
     const year = d.getFullYear();
     const month = String(d.getMonth() + 1).padStart(2, '0');
     const day = String(d.getDate()).padStart(2, '0');
     return `${year}-${month}-${day}`;
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    d.setDate(diff);
    d.setHours(0,0,0,0);
    return d;
  };

  const getMonthStart = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setHours(0,0,0,0);
    return d;
  };

  const startDate = viewMode === 'week' ? getWeekStart(anchorDate) : getMonthStart(anchorDate);
  const endDate = new Date(startDate);
  
  if (viewMode === 'week') {
    endDate.setDate(startDate.getDate() + 6);
  } else {
    endDate.setMonth(startDate.getMonth() + 1);
    endDate.setDate(0); 
  }

  const startDateStr = toDateKey(startDate);
  const endDateStr = toDateKey(endDate);

  const filteredItems = useMemo(() => {
    return items
      .filter(i => i.date >= startDateStr && i.date <= endDateStr)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [items, startDateStr, endDateStr]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const lowerTerm = searchTerm.toLowerCase();
    return filteredItems.filter(item => 
      item.content.toLowerCase().includes(lowerTerm) ||
      (item.category && CATEGORIES[item.category].label.includes(lowerTerm))
    );
  }, [filteredItems, searchTerm]);

  const isSearching = searchTerm.trim().length > 0;

  useEffect(() => {
    const report = getLatestReportForRange(startDateStr, endDateStr);
    setCurrentReport(report || null);
  }, [startDateStr, endDateStr, items]);

  const handleAnalyze = async () => {
    if (filteredItems.length === 0) {
      alert("当前时间段没有记录可供分析。");
      return;
    }
    setAiLoading(true);
    const summaryData: WeeklySummary = await generateWeeklySummary(filteredItems);
    const newReport: AIReport = {
      id: Math.random().toString(36).substring(7),
      startDate: startDateStr,
      endDate: endDateStr,
      timestamp: Date.now(),
      data: summaryData
    };
    await saveAIReport(newReport);
    setCurrentReport(newReport);
    setAiLoading(false);
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

  const chartData = useMemo(() => {
    if (viewMode === 'week') {
      const counts = Array(7).fill(0);
      filteredItems.forEach(item => {
        const [y, m, d] = item.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        let dayIdx = dateObj.getDay() - 1; 
        if (dayIdx === -1) dayIdx = 6;
        counts[dayIdx]++;
      });
      return { labels: ['一', '二', '三', '四', '五', '六', '日'], data: counts };
    } else {
      const counts = [0, 0, 0, 0, 0];
      filteredItems.forEach(item => {
        const [y, m, d] = item.date.split('-').map(Number);
        const weekIdx = Math.floor((d - 1) / 7);
        if (weekIdx < 5) counts[weekIdx]++;
      });
      return { labels: ['W1', 'W2', 'W3', 'W4', 'W5'], data: counts };
    }
  }, [filteredItems, viewMode]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = { work: [], study: [], life: [] };
    filteredItems.forEach(item => {
      const cat = item.category || 'work'; 
      if (groups[cat]) groups[cat].push(item);
    });
    return groups;
  }, [filteredItems]);

  const dateLabel = useMemo(() => {
    if (viewMode === 'week') {
      return `${startDate.getMonth()+1}/${startDate.getDate()} - ${endDate.getMonth()+1}/${endDate.getDate()}`;
    } else {
      return startDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
    }
  }, [startDate, endDate, viewMode]);

  useEffect(() => {
    if (isSearching) return;
    if (!chartRef.current || !window.Chart) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: '记录数',
          data: chartData.data,
          backgroundColor: '#6366f1',
          borderRadius: 4,
          barThickness: viewMode === 'week' ? 20 : 30,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } } },
          y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { stepSize: 1, color: '#94a3b8' }, border: { display: false } }
        },
        animation: { duration: 800, easing: 'easeOutQuart' }
      }
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [chartData, viewMode, isSearching]);

  const triggerDatePicker = () => {
    if (dateInputRef.current) {
      try { dateInputRef.current.showPicker(); } catch (e) { dateInputRef.current.click(); }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-textMain">
      <div className="flex-shrink-0 bg-surface shadow-soft rounded-b-3xl z-20 px-6 pt-12 pb-6 animate-slide-up">
        <h1 className="text-2xl font-bold mb-4">数据洞察</h1>
        <div className="relative mb-4">
           <input 
             type="text" 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             placeholder={`在${viewMode === 'week' ? '本周' : '本月'}范围内搜索...`}
             className="w-full bg-slate-100/80 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm text-textMain placeholder-textMuted focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none"
           />
           <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3 text-textMuted text-xs"></i>
           {searchTerm && (
             <button 
               onClick={() => setSearchTerm('')}
               className="absolute right-3 top-2.5 w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-300 transition-colors"
             >
               <i className="fa-solid fa-xmark text-[10px]"></i>
             </button>
           )}
        </div>
        <div className="flex flex-col gap-4">
           <div className="bg-slate-100 p-1 rounded-xl flex self-center">
              <button onClick={() => setViewMode('week')} className={`px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'week' ? 'bg-white shadow-sm text-primary' : 'text-textMuted'}`}>周视图</button>
              <button onClick={() => setViewMode('month')} className={`px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'month' ? 'bg-white shadow-sm text-primary' : 'text-textMuted'}`}>月视图</button>
           </div>
           <div className="relative">
             <button onClick={triggerDatePicker} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 shadow-sm active:scale-95 active:bg-slate-50 transition-all group">
                <i className="fa-regular fa-calendar text-textMuted group-hover:text-primary transition-colors"></i>
                <span className="text-sm font-bold text-textMain">{dateLabel}</span>
                <i className="fa-solid fa-chevron-down text-xs text-slate-300 ml-1"></i>
             </button>
             <input ref={dateInputRef} type="date" className="absolute top-0 left-0 w-full h-full opacity-0 pointer-events-none" onChange={(e) => { if(e.target.value) { const [y, m, d] = e.target.value.split('-').map(Number); setAnchorDate(new Date(y, m - 1, d)); }}} value={toDateKey(anchorDate)} />
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-32 space-y-6">
         {isSearching ? (
            <div className="space-y-4 animate-fade-in">
               <div className="flex items-center justify-between px-1">
                 <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider">搜索结果</h3>
                 <span className="text-xs text-slate-400 font-medium">{searchResults.length} 条记录</span>
               </div>
               {searchResults.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-10 text-textMuted">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                       <i className="fa-solid fa-ghost text-2xl text-slate-300"></i>
                    </div>
                    <p className="text-sm">未找到相关记录</p>
                    <p className="text-xs text-slate-400 mt-1">换个关键词试试？</p>
                 </div>
               ) : (
                 searchResults.map((item) => {
                   const catConfig = item.category ? CATEGORIES[item.category] : null;
                   return (
                     <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-3 animate-slide-up">
                       <div className="flex flex-col items-center w-14 flex-shrink-0 pt-0.5 border-r border-slate-50 pr-2">
                          <span className="text-[10px] font-bold text-slate-400">{item.date.substring(5)}</span>
                          <span className="text-xs font-bold text-textMain font-mono">{item.timeLabel}</span>
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="flex flex-col gap-1.5">
                            <p className="text-textMain text-sm leading-relaxed line-clamp-3">{item.content}</p>
                            <div className="flex items-center justify-between mt-1">
                               {catConfig && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${catConfig.bgSoft}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${catConfig.color}`}></span>
                                    <span className={`text-[10px] font-medium ${catConfig.textClass}`}>{catConfig.label}</span>
                                  </span>
                               )}
                            </div>
                            {item.attachments.length > 0 && (
                               <div className="flex gap-2 overflow-x-auto pb-1 mt-1">
                                 {item.attachments.map(att => {
                                   const isImg = att.type.startsWith('image/');
                                   if (isImg) {
                                     return (
                                       <img 
                                          key={att.id} 
                                          src={att.url} 
                                          className="w-12 h-12 rounded-lg object-cover shadow-sm border border-slate-50 cursor-zoom-in active:scale-95 transition-transform" 
                                          onClick={() => onImageClick(att.url)}
                                       />
                                     );
                                   } else {
                                     const isDownloading = downloadingId === att.id;
                                     return (
                                       <div 
                                         key={att.id}
                                         onClick={() => handleDownload(att)}
                                         className={`w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center gap-1 shadow-sm relative cursor-pointer ${isDownloading ? 'opacity-80 pointer-events-none' : 'hover:bg-slate-100'}`}
                                       >
                                          <div className="absolute top-1 right-1 text-[8px] text-slate-300">
                                            {isDownloading ? <i className="fa-solid fa-circle-notch fa-spin text-primary"></i> : <i className="fa-solid fa-download"></i>}
                                          </div>
                                          <i className={`fa-solid ${getFileIcon(att.type)} text-xs`}></i>
                                          <span className="text-[8px] text-textMuted font-bold uppercase truncate w-full text-center px-0.5">{att.name.split('.').pop()}</span>
                                       </div>
                                     );
                                   }
                                 })}
                               </div>
                            )}
                          </div>
                       </div>
                     </div>
                   );
                 })
               )}
            </div>
         ) : (
            <>
              <div className="bg-surface rounded-3xl p-5 shadow-sm border border-slate-100 animate-slide-up" style={{animationDelay: '0.1s'}}>
                  <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">趋势分析</h3>
                  <div className="h-56 relative w-full"><canvas ref={chartRef}></canvas></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                  {(['life', 'work', 'study'] as CategoryType[]).map((catKey, idx) => {
                    const cat = CATEGORIES[catKey];
                    const list = groupedItems[catKey] || [];
                    return (
                        <div key={catKey} className={`rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border border-slate-100 shadow-sm ${cat.bgSoft} animate-slide-up`} style={{animationDelay: `${0.2 + (idx * 0.1)}s`}}>
                          <div className={`p-2 rounded-full bg-white shadow-sm`}>
                              <i className={`fa-solid ${cat.icon} ${cat.textClass} text-sm`}></i>
                          </div>
                          <span className="text-xs font-bold text-slate-400">{cat.label}</span>
                          <span className={`text-2xl font-bold ${cat.textClass}`}>{list.length}</span>
                        </div>
                    )
                  })}
              </div>
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl shadow-slate-400/20 animate-slide-up relative overflow-hidden" style={{animationDelay: '0.5s'}}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[50px] pointer-events-none"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                            <i className="fa-solid fa-robot text-xl text-indigo-300"></i>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-indigo-50">AI 智能周报</h3>
                            <p className="text-[10px] text-slate-400">Powered by Gemini 3</p>
                          </div>
                      </div>
                      {currentReport && !aiLoading && (
                        <button onClick={handleAnalyze} className="text-xs text-slate-400 hover:text-white underline">重新分析</button>
                      )}
                    </div>
                    {!currentReport && !aiLoading && (
                      <div className="text-center py-6">
                        <p className="text-sm text-slate-300 mb-6 px-4 leading-relaxed">
                          点击下方按钮，让 AI 助手为您生成本周期的工作生活总结与建议。
                        </p>
                        <button 
                          onClick={handleAnalyze}
                          className="w-full py-3.5 rounded-2xl bg-white text-slate-900 font-bold text-sm hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/10"
                        >
                          <i className="fa-solid fa-wand-magic-sparkles text-indigo-500"></i>
                          生成本期分析
                        </button>
                      </div>
                    )}
                    {aiLoading && (
                      <div className="py-10 flex flex-col items-center justify-center text-slate-300 gap-4">
                          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-400"></i>
                          <span className="text-xs font-mono animate-pulse">Gemini 正在阅读您的日志...</span>
                      </div>
                    )}
                    {currentReport && !aiLoading && (
                      <div className="space-y-4 animate-fade-in bg-white/5 rounded-2xl p-4 border border-white/10">
                          <div>
                            <h4 className="text-xs font-bold text-indigo-300 mb-1 uppercase tracking-wider">周期总结</h4>
                            <p className="text-sm text-slate-200 leading-relaxed">{currentReport.data.summary}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-emerald-300 mb-1 uppercase tracking-wider">主要成就</h4>
                            <ul className="space-y-1">
                                {currentReport.data.keyAchievements.map((ach, i) => (
                                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                      <span className="mt-1 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0"></span>
                                      {ach}
                                  </li>
                                ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-blue-300 mb-1 uppercase tracking-wider">AI 建议</h4>
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex gap-3">
                                <i className="fa-regular fa-lightbulb text-yellow-400 mt-0.5"></i>
                                <p className="text-xs text-indigo-100">{currentReport.data.suggestions}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500">生成于 {new Date(currentReport.timestamp).toLocaleTimeString()}</span>
                          </div>
                      </div>
                    )}
                  </div>
              </div>
            </>
         )}
      </div>
    </div>
  );
};

export default StatsView;
