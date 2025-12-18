
import { TimelineItem, Attachment, AIReport } from '../types';

const STORAGE_KEY = 'dailycraft_timeline';
const REPORTS_KEY = 'dailycraft_ai_reports';

// --- Timeline Items ---

export const saveTimelineItem = async (item: TimelineItem): Promise<void> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const allItems = getAllTimelineItems();
  const newItems = [...allItems, item];
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
};

export const deleteTimelineItem = async (itemId: string): Promise<void> => {
  const allItems = getAllTimelineItems();
  const newItems = allItems.filter(i => i.id !== itemId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
};

export const getAllTimelineItems = (): TimelineItem[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const getItemsByDate = (date: string): TimelineItem[] => {
  const allItems = getAllTimelineItems();
  return allItems
    .filter(item => item.date === date)
    .sort((a, b) => a.timestamp - b.timestamp);
};

export const uploadFileMock = async (file: File): Promise<Attachment> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (reader.result) {
        resolve({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          type: file.type,
          url: reader.result as string 
        });
      } else {
        reject(new Error("File processing failed: No result"));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("File reading failed"));
    };
    
    reader.readAsDataURL(file);
  });
};

// --- AI Reports (Simulating "AI_Reports" Sheet) ---

export const saveAIReport = async (report: AIReport): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate write latency
  const reports = getAIReports();
  // Remove old reports for the same date range to avoid duplicates (optional logic)
  const filtered = reports.filter(r => r.startDate !== report.startDate || r.endDate !== report.endDate);
  const newReports = [report, ...filtered]; // Prepend new report
  localStorage.setItem(REPORTS_KEY, JSON.stringify(newReports));
};

export const getAIReports = (): AIReport[] => {
  const data = localStorage.getItem(REPORTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getLatestReportForRange = (startDate: string, endDate: string): AIReport | undefined => {
  const reports = getAIReports();
  return reports.find(r => r.startDate === startDate && r.endDate === endDate);
};
