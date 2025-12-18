'use client';

import React from 'react';
import { logoutAction } from '../app/actions';
import { useRouter } from 'next/navigation';

interface SettingsViewProps {
  username: string;
}

const SettingsView: React.FC<SettingsViewProps> = ({ username }) => {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
    router.push('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-background text-textMain animate-fade-in">
      <div className="flex-shrink-0 bg-surface shadow-soft rounded-b-3xl z-20 px-6 pt-12 pb-6">
        <h1 className="text-2xl font-bold mb-1">设置</h1>
        <p className="text-sm text-textMuted">管理账户与同步状态</p>
      </div>

      <div className="flex-1 p-5 space-y-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center text-2xl font-bold border-2 border-white shadow-md">
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-textMain">{username}</h2>
            <p className="text-xs text-textMuted flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              在线
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-bold text-textMain mb-4">存储与同步</h3>
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
                <i className="fa-brands fa-google-drive"></i>
              </div>
              <div>
                <p className="text-sm font-medium">Google Drive</p>
                <p className="text-xs text-textMuted">自动同步已开启</p>
              </div>
            </div>
            <span className="text-xs text-green-500 font-bold">已连接</span>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="w-full py-4 rounded-2xl bg-white border border-red-100 text-red-500 font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <i className="fa-solid fa-right-from-bracket"></i>
          退出登录
        </button>

        <div className="text-center mt-8">
           <p className="text-[10px] text-slate-300">DailyCraft v2.0 (Next.js Edition)</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;