
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

// Helper for File Icons
const getFileIcon = (mimeType: string) => {
  if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
  // Check specific formats BEFORE generic 'document' which Word claims
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint text-orange-500';
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv')) return 'fa-file-excel text-emerald-500';
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar') || mimeType.includes('rar')) return 'fa-file-zipper text-amber-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word text-blue-500';
  if (mimeType.includes('text') || mimeType.includes('txt')) return 'fa-file-lines text-slate-500';
  return 'fa-file text-slate-400';
};

// Helper to generate download URL
const getDownloadUrl = (url: string) => {
  if (!url) return '';
  try {
    // Check if it looks like a Google Drive URL
    let fileId = null;
    if (url.includes('drive.google.com')) {
      // Case 1: /file/d/ID/view
      const pathMatch = url.match(/\/d\/([^/]+)/);
      if (pathMatch && pathMatch[1]) fileId = pathMatch[1];
      
      // Case 2: id=ID query param
      if (!fileId && url.includes('id=')) {
        const urlObj = new URL(url);
        fileId = urlObj.searchParams.get('id');
      }
    }

    // Use our internal proxy for speed and to avoid redirects/auth issues
    if (fileId) {
        return `/api/proxy-download?fileId=${fileId}`;
    }
  } catch (e) {
    console.error("URL parse error", e);
  }
  return url;
};

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

      const pullRes = await pullLogsFromDriveAction(selectedDate);
      if (pullRes.success && pullRes.items) {
        // Pass selectedDate to enable pruning of locally deleted files
        upsertTimelineItems(pullRes.items, selectedDate);
      } else if (!pullRes.success && pullRes.message) {
         console.warn("Pull failed:", pullRes.message);
      }

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

  // Keyboard/Viewport Logic (Retained as per existing file state)
  const [isKeyboardDetected, setIsKeyboardDetected] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [initialWindowHeight, setInitialWindowHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInitialWindowHeight(window.innerHeight);
    if (!window.visualViewport) return;
    const handleResize = () => {
      const inputBar = document.getElementById('sticky-input-bar');
      if (!inputBar) return;
      const visualViewport = window.visualViewport!;
      const safeBottom = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop);
      setIsKeyboardDetected(safeBottom > 50 || (initialWindowHeight - window.innerHeight > 150));
      if (safeBottom > 0) {
        inputBar.style.bottom = '0px';
        inputBar.style.transform = `translateY(-${safeBottom}px)`;
      } else {
        inputBar.style.bottom = '';
        inputBar.style.transform = 'translateY(0)';
      }
    };
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, [initialWindowHeight]);

  const showKeyboardLayout = isKeyboardDetected || isInputFocused;

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
        alert("文件读取失败");
      } finally {
        setIsProcessingFile(false);
        if (e.target) e.target.value = '';
      }
    }
  };

  const activeCatConfig = CATEGORIES[currentCategory];

  return (
    <div className="flex flex-col h-screen bg-background text-textMain relative">
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

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-40">
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
                            {item.attachments.map(att => {
                              const isImg = att.type.startsWith('image/');
                              if (isImg) {
                                return (
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
                                );
                              } else {
                                // Render Non-Image File (Click to Download)
                                return (
                                  <a 
                                    key={att.id} 
                                    href={getDownloadUrl(att.url)} 
                                    // Remove target="_blank" so the browser stays in context 
                                    // while the API returns "Content-Disposition: attachment"
                                    download 
                                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer group"
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                       <i className={`fa-solid ${getFileIcon(att.type)} text-xl`}></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-textMain truncate">{att.name}</p>
                                      <p className="text-[10px] text-textMuted uppercase">{att.name.split('.').pop() || 'FILE'}</p>
                                    </div>
                                    <i className="fa-solid fa-download text-xs text-slate-300"></i>
                                  </a>
                                );
                              }
                            })}
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

      <div id="sticky-input-bar" className={`fixed left-4 right-4 z-40 max-w-lg mx-auto transition-all duration-100 ease-out ${isFuture ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'} ${showKeyboardLayout ? 'bottom-[150px] pb-2' : 'bottom-[100px]'}`}>
        <div id="loading-badge" className={`absolute -top-8 left-4 bg-black text-white text-xs py-1 px-3 rounded-full shadow-md z-50 ${isProcessingFile ? 'block' : 'hidden'}`}>
           <i className="fa-solid fa-circle-notch fa-spin mr-1.5"></i> 文件处理中...
        </div>
        <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
        <input type="file" ref={fileInputRef} className="hidden" accept="*/*" onChange={handleFileUpload} />

        <div className={`glass rounded-[2rem] p-2 shadow-soft flex items-end gap-2 transition-all duration-300 border ${activeCatConfig.borderColor} ${activeCatConfig.ringColor} focus-within:ring-2 ring-offset-2`}>
          <div className="relative flex-shrink-0">
             <div className={`absolute bottom-full left-0 mb-3 flex flex-col gap-2 transition-all duration-300 origin-bottom-left ${isUploadMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 <button onClick={() => { setIsUploadMenuOpen(false); cameraInputRef.current?.click(); }} className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100"><div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md"><i className="fa-solid fa-camera text-xs"></i></div><span className="text-xs font-bold text-textMain">拍照</span></button>
                 <button onClick={() => { setIsUploadMenuOpen(false); fileInputRef.current?.click(); }} className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100"><div className="w-8 h-8 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md"><i className="fa-regular fa-folder-open text-xs"></i></div><span className="text-xs font-bold text-textMain">文件</span></button>
             </div>
             <button onClick={() => !isProcessingFile && setIsUploadMenuOpen(!isUploadMenuOpen)} className={`w-10 h-10 rounded-full ${activeCatConfig.bgSoft} ${activeCatConfig.textClass} flex items-center justify-center active:scale-95 ${isUploadMenuOpen ? 'rotate-45' : ''}`}><i className={`fa-solid ${isUploadMenuOpen ? 'fa-plus' : 'fa-paperclip'}`}></i></button>
          </div>

          <div className="flex-grow flex flex-col justify-center min-h-[44px]">
             {attachments.length > 0 && (
                <div className="flex gap-2 mb-1 overflow-x-auto pb-1 pl-1">
                   {attachments.map(att => {
                      const isImg = att.type.startsWith('image/');
                      return (
                        <div key={att.id} className={`relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 ${!isImg ? 'bg-slate-50 flex items-center justify-center' : ''}`}>
                          {isImg ? (
                            <img src={att.url} className="w-full h-full object-cover" />
                          ) : (
                            <i className={`fa-solid ${getFileIcon(att.type)} text-xs`}></i>
                          )}
                          <button onClick={() => setAttachments(prev => prev.filter(p => p.id !== att.id))} className="absolute inset-0 bg-black/40 text-white text-[10px] flex items-center justify-center hover:bg-black/60 transition-colors"><i className="fa-solid fa-xmark"></i></button>
                        </div>
                      );
                   })}
                </div>
             )}
             <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={isFuture ? "无法在未来添加日志" : `记录${activeCatConfig.label}点滴...`} className="w-full bg-transparent border-none outline-none text-[15px] text-textMain placeholder-slate-400 resize-none py-2.5 max-h-32" rows={1} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=t.scrollHeight+'px'; }} />
          </div>

          <div className="relative flex-shrink-0">
             <div className={`absolute bottom-full right-0 mb-6 flex flex-col gap-2 transition-all duration-300 origin-bottom ${isCategoryMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 {Object.values(CATEGORIES).map((cat) => (
                  <button key={cat.id} onClick={() => { onCategoryChange(cat.id); setIsCategoryMenuOpen(false); }} className="flex items-center gap-2 pr-3 pl-2 py-1.5 rounded-full shadow-lg bg-white border border-slate-100 whitespace-nowrap justify-end"><span className="text-xs font-bold text-textMain">{cat.label}</span><div className={`w-8 h-8 rounded-full ${cat.color} text-white flex items-center justify-center shadow-md`}><i className={`fa-solid ${cat.icon} text-xs`}></i></div></button>
                ))}
             </div>
             <button onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)} className={`absolute bottom-full right-1.5 mb-2 w-8 h-8 rounded-full shadow-lg z-10 flex items-center justify-center transition-all border-2 border-white ${isCategoryMenuOpen ? 'rotate-45 bg-slate-200 text-slate-500' : `${activeCatConfig.color} text-white`}`}>{isCategoryMenuOpen ? <i className="fa-solid fa-plus"></i> : <i className={`fa-solid ${activeCatConfig.icon} text-xs`}></i>}</button>
             <button onClick={handleSend} disabled={isFuture || isProcessingFile || isSending || (!inputText.trim() && attachments.length === 0)} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md ${(!isFuture && !isProcessingFile && (inputText.trim() || attachments.length > 0)) ? `${activeCatConfig.color} text-white` : 'bg-slate-200 text-slate-400'}`}>{isSending ? <i className="fa-solid fa-spinner fa-spin text-sm"></i> : <i className="fa-solid fa-paper-plane text-sm translate-x-[1px] translate-y-[1px]"></i>}</button>
          </div>
        </div>
      </div>

      <ConfirmModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} />
    </div>
  );
};

export default LogView;
