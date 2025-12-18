import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = "删除记录?",
  message = "确定要删除这条记录吗？此操作无法撤销。"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100 animate-slide-up">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
            <i className="fa-solid fa-trash-can text-red-500 text-lg"></i>
          </div>
          <h3 className="text-lg font-bold text-textMain mb-2">{title}</h3>
          <p className="text-sm text-textMuted leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 shadow-lg shadow-red-500/30 transition-all active:scale-95"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;