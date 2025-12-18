import React from 'react';
import { AppTab } from '../types';

interface NavBarProps {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const NavBar: React.FC<NavBarProps> = ({ currentTab, onTabChange }) => {
  const navItems = [
    { id: AppTab.LOG, icon: 'fa-pen-to-square', label: '记录' },
    { id: AppTab.CALENDAR, icon: 'fa-calendar-days', label: '日历' },
    { id: AppTab.STATS, icon: 'fa-chart-simple', label: '分析' },
    { id: AppTab.SETTINGS, icon: 'fa-gear', label: '设置' },
  ];

  return (
    <div className="fixed bottom-6 left-6 right-6 z-50">
      <div className="glass h-[70px] rounded-3xl shadow-soft flex justify-around items-center px-2">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-300 group`}
            >
              <div className={`
                flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 mb-1
                ${isActive ? 'bg-primary text-white shadow-lg shadow-primary/30 translate-y-[-10px]' : 'text-textMuted group-hover:bg-slate-100'}
              `}>
                <i className={`fa-solid ${item.icon} text-lg`}></i>
              </div>
              
              <span className={`
                absolute bottom-2 text-[10px] font-semibold transition-all duration-300
                ${isActive ? 'text-primary opacity-100 translate-y-[-2px]' : 'text-textMuted opacity-0 translate-y-2'}
              `}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NavBar;