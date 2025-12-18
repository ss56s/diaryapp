export interface TimelineItem {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number; // Epoch for sorting
  timeLabel: string; // HH:MM
  content: string;
  category?: CategoryType;
  attachments: Attachment[];
  syncStatus?: 'synced' | 'pending' | 'error';
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url: string; 
}

export enum AppTab {
  LOG = 'LOG',
  CALENDAR = 'CALENDAR',
  STATS = 'STATS',
  SETTINGS = 'SETTINGS'
}

export interface WeeklySummary {
  summary: string;
  keyAchievements: string[];
  suggestions: string;
}

export interface AIReport {
  id: string;
  startDate: string;
  endDate: string;
  timestamp: number;
  data: WeeklySummary;
}

export type CategoryType = 'work' | 'study' | 'life';

export const CATEGORIES: Record<CategoryType, { id: CategoryType; label: string; color: string; ringColor: string; borderColor: string; icon: string; textClass: string; bgSoft: string }> = {
  life: { 
    id: 'life', 
    label: '日常', 
    color: 'bg-emerald-500', 
    ringColor: 'focus-within:ring-emerald-400', 
    borderColor: 'border-emerald-400',
    icon: 'fa-mug-hot', 
    textClass: 'text-emerald-600',
    bgSoft: 'bg-emerald-50'
  },
  work: { 
    id: 'work', 
    label: '工作', 
    color: 'bg-indigo-500', 
    ringColor: 'focus-within:ring-indigo-400', 
    borderColor: 'border-indigo-400',
    icon: 'fa-briefcase', 
    textClass: 'text-indigo-600',
    bgSoft: 'bg-indigo-50'
  },
  study: { 
    id: 'study', 
    label: '学习', 
    color: 'bg-blue-500', 
    ringColor: 'focus-within:ring-blue-400', 
    borderColor: 'border-blue-400',
    icon: 'fa-graduation-cap', 
    textClass: 'text-blue-600',
    bgSoft: 'bg-blue-50'
  }
};