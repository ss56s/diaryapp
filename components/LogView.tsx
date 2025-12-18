
import React, { useState, useEffect, useRef } from 'react';
import CalendarStrip from './CalendarStrip';
import ConfirmModal from './ConfirmModal';
import { TimelineItem, Attachment, CategoryType, CATEGORIES } from '../types';
import { getItemsByDate, saveTimelineItem, uploadFileMock, deleteTimelineItem, upsertTimelineItems, getPendingDeletes, removePendingDelete } from '../services/storageService';
import { syncLogAction, pullLogsFromDriveAction, deleteLogAction } from '../app/actions';

interface LogViewProps {
  currentCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  onImageClick: (url: string) => void;
}

const LogView: React.FC<LogViewProps> = ({ currentCategory, onCategoryChange, onImageClick }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const isFuture = selectedDate > todayStr;

  const refreshItems = () => {
    setItems(getItemsByDate(selectedDate));
  };

  useEffect(() => {
    refreshItems();
  }, [selectedDate]);

  useEffect(() => {
    if (selectedDate === todayStr && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items, selectedDate]);

  // Handle Full Sync (Pull + Push Updates + Push Deletes)
  const handleFullSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      // 1. Process Pending Deletes First (Clean up Drive)
      const pendingDeletes = getPendingDeletes();
      if (pendingDeletes.length > 0) {
        console.log(`[Sync] Processing ${pendingDeletes.length} deletions...`);
        for (const deleteId of pendingDeletes) {
           const res = await deleteLogAction(selectedDate, deleteId);
           if (res.success || res.message === '删除失败') { 
             removePendingDelete(deleteId);
           }
        }
      }

      // 2. Pull from Drive
      const pullRes = await pullLogsFromDriveAction(selectedDate);
      if (pullRes.success && pullRes.items) {
        upsertTimelineItems(pullRes.items);
      } else if (!pullRes.success && pullRes.message) {
         console.warn("Pull failed:", pullRes.message);
      }

      // 3. Push pending logs (Updates/Creates)
      const currentItems = getItemsByDate(selectedDate);
      const pendingItems = currentItems.filter(i => i.syncStatus !== 'synced');
      
      let failCount = 0;
      let lastError = "";

      for (const item of pendingItems) {
        const res = await syncLogAction(item);
        if (res.success && res.syncedItem) {
          await saveTimelineItem(res.syncedItem);
        } else {
          failCount++;
          lastError = res.message || "未知错误";
          await saveTimelineItem({ ...item, syncStatus: 'error' });
        }
      }
      
      if (failCount > 0) {
        alert(`同步失败 (${failCount}条): ${lastError}\n请检查网络或Google Drive授权配置。`);
      }

      refreshItems();
    } catch (err: any) {
      console.error("Sync error:", err);
      alert("同步发生严重错误: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Optimized Keyboard Logic
  // We rely on 'interactive-widget=resizes-content' in meta tag for position,
  // we only track state to adjust padding/margins.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      // Simple heuristic: if window height shrinks significantly, keyboard is likely open
      // This is more robust than visualViewport calculations for just toggling UI states
      const isHeightShrunk = window.innerHeight < window.screen.height * 0.75;
      setIsKeyboardOpen(isHeightShrunk);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine if we should show the "Compact/Keyboard" Layout
  const showKeyboardLayout = isKeyboardOpen || isInputFocused;

  const handleSend = async () => {
    if (isProcessingFile || isFuture || isSending || (!inputText.trim() && attachments.length === 0)) return;
    
    setIsSending(true);
    const now = new Date();
    const newItem: TimelineItem = {
      id: Math.random().toString(36).substr(2, 9),
      date: selectedDate, 
      timestamp: now.getTime(),
      timeLabel: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      content: inputText,
      category: currentCategory,
      attachments: attachments,
      syncStatus: 'pending'
    };

    await saveTimelineItem(newItem);
    refreshItems();
    setInputText('');
    setAttachments([]);
    
    // Auto scroll to bottom after sending
    setTimeout(() => {
       scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    syncLogAction(newItem).then(res => {
      if (res.success && res.syncedItem) {
        saveTimelineItem(res.syncedItem).then(() => refreshItems());
      } else {
        saveTimelineItem({ ...newItem, syncStatus: 'error' }).then(() => refreshItems());
      }
    });
    
    setIsSending(false);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      await deleteTimelineItem(itemToDelete);
      deleteLogAction(selectedDate, itemToDelete).then(res => {
         if (res.success) removePendingDelete(itemToDelete);
      });
      refreshItems();
      setItemToDelete(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsProcessingFile(true);
      setIsUploadMenuOpen(false);
      try {
        const att = await uploadFileMock(file);
        setAttachments(prev => [...prev, att]);
      } catch (err) {
        alert("图片读取失败");
      } finally {
        setIsProcessingFile(false);
        if (e.target) e.target.value = '';
      }
    }
  };

  const activeCatConfig = CATEGORIES[currentCategory];

  return (
    <div className="flex flex-col h-screen bg-background text-textMain relative overflow-hidden">
      <CalendarStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <button
        onClick={handleFullSync}
        className={`fixed right-5 top-28 z-50 w-12 h-12 rounded-full shadow-lg border-2 border-white flex items-center justify-center transition-all active:scale-95 ${
          isSyncing 
            ? 'bg-white text-primary animate-spin' 
            : 'bg-primary text-white hover:bg-primaryDark'
        }`}
        title="同步到云端"
      >
        <i className="fa-solid fa-arrows-rotate text-lg"></i>
      </button>

      {/* Main List Area - Adjusted padding-bottom to prevent content from being hidden behind input bar */}
      <div 
        className={`flex-1 overflow-y-auto px-5 py-4 transition-all duration-300 ${showKeyboardLayout ? 'pb-24' : 'pb-40'}`}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-textMuted/60">
            <div className="w-20 h-20 bg-white rounded-3xl shadow-soft flex items-center justify-center mb-6">
              <i className={`fa-solid ${isFuture ? 'fa-clock-rotate-left' : 'fa-feather-pointed'} text-3xl text-primary/30`}></i>
            </div>
            <p className="text-base font-medium text-textMuted">{isFuture ? '未来尚未到来' : '记录你今天的成就'}</p>
          </div>
        ) : (
          <div className="relative pl-4 space-y-8 before:absolute before:left-4 before:top-2 before:bottom-0 before:w-0.5 before:bg-slate-200">
            {items.map((item) => {
              const catConfig = item.category ? CATEGORIES[item.category] : null;
              const isSynced = item.syncStatus === 'synced';
              const isError = item.syncStatus === 'error';
              
              return (
                <div key={item.id} className="relative animate-slide-up">
                  <div className={`absolute -left-[21px] top-4 w-3.5 h-3.5 rounded-full bg-surface border-2 shadow-sm z-10 ${catConfig ? catConfig.borderColor : 'border-slate-300'}`}></div>
                  
                  <div className="mb-1 ml-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-textMuted/80 tracking-wide font-mono">{item.timeLabel}</span>
                      {catConfig && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${catConfig.bgSoft}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${catConfig.color}`}></span>
                          <span className={`text-[10px] font-medium ${catConfig.textClass}`}>{catConfig.label}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 pr-1" title={isSynced ? "已同步" : isError ? "同步失败(点击重试)" : "等待同步"}>
                       <button 
                         onClick={() => isError ? handleFullSync() : null}
                         className={`w-2.5 h-2.5 rounded-full shadow-sm transition-colors ${
                           isSynced ? 'bg-emerald-500' : 
                           isError ? 'bg-red-500 animate-pulse cursor-pointer' : 
                           'bg-amber-400'
                         }`}
                       ></button>
                    </div>
                  </div>

                  <div className="bg-surface rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-textMain text-[15px] leading-relaxed whitespace-pre-wrap break-words">{item.content}</p>
                        {item.attachments.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {item.attachments.map(att => (
                              <div key={att.id} className="relative aspect-video rounded-xl overflow-hidden shadow-sm cursor-zoom-in active:scale-95 transition-transform" onClick={() => onImageClick(att.url)}>
                                 <img 
                                   src={att.url} 
                                   className="w-full h-full object-cover" 
                                   alt="attachment" 
                                   onError={(e) => {
                                      const t = e.target as HTMLImageElement;
                                      t.style.display='none';
                                      t.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-slate-50 text-xs text-slate-400 p-2 text-center"><i class="fa-solid fa-image mr-1"></i>图片已同步</div>`;
                                   }}
                                 />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => { setItemToDelete(item.id); setIsDeleteModalOpen(true); }} className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1.5 -mr-1 -mt-1"><i className="fa-regular fa-trash-can text-lg"></i></button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* 
        Optimized Input Bar 
        - Uses position:fixed and bottom-0.
        - Relies on 'interactive-widget=resizes-content' to auto-move with keyboard.
        - Toggles margin/padding based on keyboard state for aesthetics.
      */}
      <div 
        id="sticky-input-bar" 
        className={`fixed left-0 right-0 z-40 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] 
          ${isFuture ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'} 
          ${showKeyboardLayout 
              ? 'bottom-0 bg-white/90 backdrop-blur-md pt-3 pb-2 border-t border-slate-100' // Keyboard Open: Flush to bottom, with background
              : 'bottom-[90px] px-4' // Keyboard Closed: Floating above Nav
          }
        `}
      >
        <div id="loading-badge" className={`absolute -top-10 left-4 bg-black/80 text-white text-xs py-1.5 px-3 rounded-full shadow-lg z-50 backdrop-blur-sm ${isProcessingFile ? 'block animate-pulse' : 'hidden'}`}>
           <i className="fa-solid fa-circle-notch fa-spin mr-1.5"></i> 图片处理中...
        </div>
        
        <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
        <input type="file" ref={fileInputRef} className="hidden" accept="*/*" onChange={handleFileUpload} />

        <div className={`
           relative flex items-end gap-2 transition-all duration-300 
           ${showKeyboardLayout 
              ? 'px-3 max-w-full' // Full width when typing
              : 'glass rounded-[2rem] p-2 shadow-soft border max-w-lg mx-auto ' + activeCatConfig.borderColor + ' ' + activeCatConfig.ringColor + ' focus-within:ring-2 ring-offset-2'
           }
        `}>
          {/* Action Buttons (Left) */}
          <div className="relative flex-shrink-0 mb-0.5">
             <div className={`absolute bottom-full left-0 mb-3 flex flex-col gap-2 transition-all duration-300 origin-bottom-left ${isUploadMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 <button onClick={() => { setIsUploadMenuOpen(false); cameraInputRef.current?.click(); }} className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100"><div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md"><i className="fa-solid fa-camera text-xs"></i></div><span className="text-xs font-bold text-textMain">拍照</span></button>
                 <button onClick={() => { setIsUploadMenuOpen(false); fileInputRef.current?.click(); }} className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100"><div className="w-8 h-8 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md"><i className="fa-regular fa-folder-open text-xs"></i></div><span className="text-xs font-bold text-textMain">文件</span></button>
             </div>
             <button onClick={() => !isProcessingFile && setIsUploadMenuOpen(!isUploadMenuOpen)} className={`w-10 h-10 rounded-full ${activeCatConfig.bgSoft} ${activeCatConfig.textClass} flex items-center justify-center active:scale-95 ${isUploadMenuOpen ? 'rotate-45' : ''}`}><i className={`fa-solid ${isUploadMenuOpen ? 'fa-plus' : 'fa-paperclip'}`}></i></button>
          </div>

          {/* Text Input Area */}
          <div className={`flex-grow flex flex-col justify-center min-h-[44px] ${showKeyboardLayout ? 'bg-slate-100 rounded-2xl px-2' : ''}`}>
             {attachments.length > 0 && (
                <div className="flex gap-2 mb-1 overflow-x-auto pb-1 pl-1 pt-1.5">
                   {attachments.map(att => (
                      <div key={att.id} className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                        <img src={att.url} className="w-full h-full object-cover" />
                        <button onClick={() => setAttachments(prev => prev.filter(p => p.id !== att.id))} className="absolute inset-0 bg-black/40 text-white text-[10px] flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
                      </div>
                   ))}
                </div>
             )}
             <textarea 
               value={inputText} 
               onChange={(e) => setInputText(e.target.value)} 
               placeholder={isFuture ? "无法在未来添加日志" : `记录${activeCatConfig.label}点滴...`} 
               className={`w-full bg-transparent border-none outline-none text-[15px] text-textMain placeholder-slate-400 resize-none py-2.5 max-h-32 ${showKeyboardLayout ? 'px-1' : ''}`} 
               rows={1} 
               onFocus={() => setIsInputFocused(true)} 
               onBlur={() => setIsInputFocused(false)} 
               onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=t.scrollHeight+'px'; }} 
             />
          </div>

          {/* Action Buttons (Right) */}
          <div className="relative flex-shrink-0 mb-0.5">
             <div className={`absolute bottom-full right-0 mb-6 flex flex-col gap-2 transition-all duration-300 origin-bottom ${isCategoryMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 {Object.values(CATEGORIES).map((cat) => (
                  <button key={cat.id} onClick={() => { onCategoryChange(cat.id); setIsCategoryMenuOpen(false); }} className="flex items-center gap-2 pr-3 pl-2 py-1.5 rounded-full shadow-lg bg-white border border-slate-100 whitespace-nowrap justify-end"><span className="text-xs font-bold text-textMain">{cat.label}</span><div className={`w-8 h-8 rounded-full ${cat.color} text-white flex items-center justify-center shadow-md`}><i className={`fa-solid ${cat.icon} text-xs`}></i></div></button>
                ))}
             </div>
             
             {!showKeyboardLayout && (
                <button onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)} className={`absolute bottom-full right-1.5 mb-2 w-8 h-8 rounded-full shadow-lg z-10 flex items-center justify-center transition-all border-2 border-white ${isCategoryMenuOpen ? 'rotate-45 bg-slate-200 text-slate-500' : `${activeCatConfig.color} text-white`}`}>{isCategoryMenuOpen ? <i className="fa-solid fa-plus"></i> : <i className={`fa-solid ${activeCatConfig.icon} text-xs`}></i>}</button>
             )}

             <button onClick={handleSend} disabled={isFuture || isProcessingFile || isSending || (!inputText.trim() && attachments.length === 0)} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md ${(!isFuture && !isProcessingFile && (inputText.trim() || attachments.length > 0)) ? `${activeCatConfig.color} text-white` : 'bg-slate-200 text-slate-400'}`}>{isSending ? <i className="fa-solid fa-spinner fa-spin text-sm"></i> : <i className="fa-solid fa-paper-plane text-sm translate-x-[1px] translate-y-[1px]"></i>}</button>
          </div>
        </div>
      </div>

      <ConfirmModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} />
    </div>
  );
};

export default LogView;
