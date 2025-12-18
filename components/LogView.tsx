
import React, { useState, useEffect, useRef } from 'react';
import CalendarStrip from './CalendarStrip';
import ConfirmModal from './ConfirmModal';
import { TimelineItem, Attachment, CategoryType, CATEGORIES } from '../types';
import { getItemsByDate, saveTimelineItem, uploadFileMock, deleteTimelineItem } from '../services/storageService';

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
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // File Processing State (The "Lock")
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Menu States
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

  // Keyboard State
  const [isKeyboardDetected, setIsKeyboardDetected] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [initialWindowHeight, setInitialWindowHeight] = useState(0);

  // Hidden Input Refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const isFuture = selectedDate > todayStr;

  useEffect(() => {
    setItems(getItemsByDate(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    const isToday = selectedDate === todayStr;
    if (isToday && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items, selectedDate]);

  // --- Visual Viewport Logic ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setInitialWindowHeight(window.innerHeight);

    if (!window.visualViewport) return;

    const handleResize = () => {
      const inputBar = document.getElementById('sticky-input-bar');
      if (!inputBar) return;

      const visualViewport = window.visualViewport!;
      const visualHeight = visualViewport.height;
      const windowHeight = window.innerHeight;
      
      // Calculate how much space is taken by the keyboard/UI at the bottom
      // Standard Formula: Layout Height - Visual Height - Scroll Offset
      const offsetTop = visualViewport.offsetTop;
      const coveredBottom = windowHeight - visualHeight - offsetTop;
      
      // Ensure we don't go negative
      const safeBottom = Math.max(0, coveredBottom);

      // Detect keyboard open state
      const isResized = (initialWindowHeight > 0) && (initialWindowHeight - windowHeight > 150);
      const isOverlay = safeBottom > 50;
      const isKeyboard = isResized || isOverlay;

      setIsKeyboardDetected(isKeyboard);

      // Apply the offset if we are in overlay mode (safeBottom > 0)
      if (safeBottom > 0) {
        // FORCE bottom to 0px to establish a baseline at the very bottom of the layout viewport
        inputBar.style.bottom = '0px';
        // Use NEGATIVE translateY to lift the element UP by the keyboard height
        inputBar.style.transform = `translateY(-${safeBottom}px)`;
      } else {
        // Clear manual styles so CSS classes control the position
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

  // Use focused state as a fallback to ensure we switch to 'docked' mode
  const showKeyboardLayout = isKeyboardDetected || isInputFocused;

  // --- Send Handler ---
  const handleSend = async () => {
    if (isProcessingFile) {
        alert('图片正在处理，请稍候...');
        return;
    }
    if (isFuture) return;
    if (!inputText.trim() && attachments.length === 0) {
        alert('写点什么吧'); 
        return;
    }
    if (isSending) return;
    
    setIsSending(true);
    const now = new Date();
    const newItem: TimelineItem = {
      id: Math.random().toString(36).substr(2, 9),
      date: selectedDate, 
      timestamp: now.getTime(),
      timeLabel: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      content: inputText,
      category: currentCategory,
      attachments: attachments
    };

    await saveTimelineItem(newItem);
    setItems(prev => [...prev, newItem]);
    setInputText('');
    setAttachments([]);
    setIsSending(false);
  };

  const initiateDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      await deleteTimelineItem(itemToDelete);
      setItems(getItemsByDate(selectedDate));
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
        console.error("Image processing error:", err);
        alert("图片读取失败，请重试。");
      } finally {
        setIsProcessingFile(false);
        if (e.target) e.target.value = '';
      }
    } else {
       setIsUploadMenuOpen(false);
    }
  };

  const activeCatConfig = CATEGORIES[currentCategory];

  return (
    <div className="flex flex-col h-screen bg-background text-textMain">
      <CalendarStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Feed Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-40">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-textMuted/60">
            {isFuture ? (
               <>
                <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6">
                  <i className="fa-solid fa-clock-rotate-left text-3xl text-slate-300"></i>
                </div>
                <p className="text-base font-medium text-textMuted">未来尚未到来</p>
                <p className="text-xs mt-2 text-textMuted/70">无法在未来日期添加日志</p>
               </>
            ) : (
               <>
                <div className="w-20 h-20 bg-white rounded-3xl shadow-soft flex items-center justify-center mb-6">
                  <i className="fa-solid fa-feather-pointed text-3xl text-primary/30"></i>
                </div>
                <p className="text-base font-medium text-textMuted">记录你今天的成就</p>
               </>
            )}
          </div>
        ) : (
          <div className="relative pl-4 space-y-8 before:absolute before:left-4 before:top-2 before:bottom-0 before:w-0.5 before:bg-slate-200">
            {items.map((item) => {
              const catConfig = item.category ? CATEGORIES[item.category] : null;
              
              return (
                <div key={item.id} className="relative group animate-slide-up">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[21px] top-4 w-3.5 h-3.5 rounded-full bg-surface border-2 shadow-sm z-10 ${catConfig ? catConfig.borderColor : 'border-slate-300'}`}></div>
                  
                  {/* Time Label & Category Dot */}
                  <div className="mb-1 ml-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-textMuted/80 tracking-wide font-mono">
                      {item.timeLabel}
                    </span>
                    {catConfig && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${catConfig.bgSoft}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${catConfig.color}`}></span>
                        <span className={`text-[10px] font-medium ${catConfig.textClass}`}>{catConfig.label}</span>
                      </span>
                    )}
                  </div>

                  {/* Card */}
                  <div className="bg-surface rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start gap-3">
                      {/* Content & Attachments Wrapper */}
                      <div className="flex-1 min-w-0">
                        <p className="text-textMain text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                          {item.content}
                        </p>

                        {item.attachments.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {item.attachments.map(att => (
                              <div 
                                key={att.id} 
                                className="relative aspect-video rounded-xl overflow-hidden shadow-sm cursor-zoom-in active:scale-95 transition-transform"
                                onClick={() => onImageClick(att.url)}
                              >
                                 <img src={att.url} className="w-full h-full object-cover" alt="attachment" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Always Visible Delete Button */}
                      <button 
                        onClick={() => initiateDelete(item.id)}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1.5 -mr-1 -mt-1"
                        title="删除记录"
                      >
                        <i className="fa-regular fa-trash-can text-lg"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Sticky Input Bar */}
      <div 
        id="sticky-input-bar"
        className={`fixed left-4 right-4 z-40 max-w-lg mx-auto transition-all duration-100 ease-out ${isFuture ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'} ${showKeyboardLayout ? 'bottom-[150px] pb-2' : 'bottom-[100px]'}`}
      >
        
        {/* Processing Badge */}
        <div 
           id="loading-badge"
           className={`absolute -top-8 left-4 bg-black text-white text-xs py-1 px-3 rounded-full shadow-md z-50 ${isProcessingFile ? 'block' : 'hidden'}`}
        >
          📸 图片压缩处理中...
        </div>

        {/* Hidden Inputs */}
        <input 
          type="file" 
          ref={cameraInputRef} 
          className="hidden" 
          accept="image/*" 
          capture="environment"
          onChange={handleFileUpload}
        />
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="*/*"
          onChange={handleFileUpload}
        />

        <div className={`
            glass rounded-[2rem] p-2 shadow-soft flex items-end gap-2 transition-all duration-300 border
            focus-within:ring-2 ring-offset-2
            ${activeCatConfig.borderColor} ${activeCatConfig.ringColor}
        `}>
          
          {/* Upload Button */}
          <div className="relative flex-shrink-0">
             <div className={`absolute bottom-full left-0 mb-3 flex flex-col gap-2 transition-all duration-300 origin-bottom-left ${isUploadMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 <button
                    onClick={() => { setIsUploadMenuOpen(false); cameraInputRef.current?.click(); }}
                    className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100 transition-transform active:scale-95 whitespace-nowrap"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                      <i className="fa-solid fa-camera text-xs"></i>
                    </div>
                    <span className="text-xs font-bold text-textMain">拍照</span>
                  </button>

                 <button
                    onClick={() => { setIsUploadMenuOpen(false); fileInputRef.current?.click(); }}
                    className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg bg-white border border-slate-100 transition-transform active:scale-95 whitespace-nowrap"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-500 text-white flex items-center justify-center shadow-md">
                      <i className="fa-regular fa-folder-open text-xs"></i>
                    </div>
                    <span className="text-xs font-bold text-textMain">文件</span>
                  </button>
             </div>

             <button 
                onClick={() => !isProcessingFile && setIsUploadMenuOpen(!isUploadMenuOpen)}
                disabled={isFuture || isProcessingFile}
                className={`w-10 h-10 rounded-full ${activeCatConfig.bgSoft} ${activeCatConfig.textClass} hover:opacity-80 transition-all flex items-center justify-center active:scale-95 ${isUploadMenuOpen ? 'rotate-45' : ''} ${isProcessingFile ? 'cursor-not-allowed opacity-50' : ''}`}
             >
               <i className={`fa-solid ${isUploadMenuOpen ? 'fa-plus' : 'fa-paperclip'}`}></i>
             </button>
          </div>

          <div className="flex-grow flex flex-col justify-center min-h-[44px]">
             {attachments.length > 0 && (
                <div className="flex gap-2 mb-1 overflow-x-auto pb-1 pl-1">
                   {attachments.map(att => (
                      <div key={att.id} className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                        <img src={att.url} className="w-full h-full object-cover" />
                        <button onClick={() => setAttachments(prev => prev.filter(p => p.id !== att.id))} className="absolute inset-0 bg-black/40 text-white text-[10px] flex items-center justify-center">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                   ))}
                </div>
             )}
             <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isFuture ? "无法在未来日期添加日志" : `记录${activeCatConfig.label}点滴...`}
              className={`w-full bg-transparent border-none outline-none text-[15px] text-textMain placeholder-slate-400 resize-none py-2.5 max-h-32`}
              rows={1}
              disabled={isFuture}
              onFocus={(e) => {
                 setIsInputFocused(true);
                 const target = e.target as HTMLElement;
                 setTimeout(() => {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 }, 300);
              }}
              onBlur={() => {
                 setIsInputFocused(false);
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />
          </div>

          {/* Send Button */}
          <div className="relative flex-shrink-0">
             <div className={`absolute bottom-full right-0 mb-6 flex flex-col gap-2 transition-all duration-300 origin-bottom ${isCategoryMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}`}>
                 {Object.values(CATEGORIES).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onCategoryChange(cat.id);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 pr-3 pl-2 py-1.5 rounded-full shadow-lg bg-white border border-slate-100 transition-transform active:scale-95 whitespace-nowrap justify-end`}
                  >
                    <span className="text-xs font-bold text-textMain">{cat.label}</span>
                    <div className={`w-8 h-8 rounded-full ${cat.color} text-white flex items-center justify-center shadow-md`}>
                      <i className={`fa-solid ${cat.icon} text-xs`}></i>
                    </div>
                  </button>
                ))}
             </div>

             <button
               onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
               className={`absolute bottom-full right-1.5 mb-2 w-8 h-8 rounded-full shadow-lg z-10 flex items-center justify-center transition-all duration-300 border-2 border-white ${isCategoryMenuOpen ? 'rotate-45 bg-slate-200 text-slate-500' : `${activeCatConfig.color} text-white hover:scale-110`}`}
               title="选择分类"
             >
                {isCategoryMenuOpen ? (
                  <i className="fa-solid fa-plus"></i>
                ) : (
                  <i className={`fa-solid ${activeCatConfig.icon} text-xs`}></i>
                )}
             </button>

             <button
              id="send-btn"
              onClick={handleSend}
              disabled={isFuture || isProcessingFile || isSending || (!inputText.trim() && attachments.length === 0)}
              style={{ opacity: isProcessingFile ? 0.5 : 1 }}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration +300 shadow-md ${
                (!isFuture && !isProcessingFile && (inputText.trim() || attachments.length > 0))
                  ? `${activeCatConfig.color} text-white hover:shadow-lg hover:scale-105 active:scale-95` 
                  : 'bg-slate 200 text-slate 400 cursor-not-allowed'
              }`}
            >
              {isSending ? (
                 <i className="fa-solid fa-spinner fa-spin text-sm"></i>
              ) : (
                 <i className="fa-solid fa-paper-plane text-sm translate-x-[1px] translate-y-[1px]"></i>
              )}
            </button>
          </div>

        </div>
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

export default LogView;
