'use client';

import React, { useState } from 'react';
import { loginAction } from '../actions';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const result = await loginAction(formData);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.message || '登录失败');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-8">
           <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
             <i className="fa-solid fa-feather-pointed"></i>
           </div>
           <h1 className="text-2xl font-bold text-slate-800">DailyCraft</h1>
           <p className="text-slate-400 text-sm">记录生活，智见未来</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              name="username" 
              type="text" 
              placeholder="用户名" 
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
          <div>
             <input 
              name="password" 
              type="password" 
              placeholder="密码" 
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30 hover:bg-primaryDark active:scale-95 transition-all disabled:opacity-70"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}