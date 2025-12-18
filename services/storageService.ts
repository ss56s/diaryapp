
import { TimelineItem, Attachment, AIReport } from '../types';

const STORAGE_KEY = 'dailycraft_timeline';
const REPORTS_KEY = 'dailycraft_ai_reports';
const DELETED_IDS_KEY = 'dailycraft_deleted_ids';

// --- Deleted Items Management (Tombstones) ---
export const markLogAsDeleted = (logId: string) => {
  const deleted = getPendingDeletes();
  if (!deleted.includes(logId)) {
    deleted.push(logId);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(deleted));
  }
};

export const getPendingDeletes = (): string[] => {
  const data = localStorage.getItem(DELETED_IDS_KEY);
  return data ? JSON.parse(data) : [];
};

export const removePendingDelete = (logId: string) => {
  const deleted = getPendingDeletes();
  const newDeleted = deleted.filter(id => id !== logId);
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(newDeleted));
};

// --- Timeline Management ---

export const saveTimelineItem = async (item: TimelineItem): Promise<void> => {
  const allItems = getAllTimelineItems();
  const existingIndex = allItems.findIndex(i => i.id === item.id);
  
  let newItems;
  if (existingIndex > -1) {
    newItems = [...allItems];
    newItems[existingIndex] = item;
  } else {
    newItems = [...allItems, item];
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
};

export const upsertTimelineItems = (remoteItems: TimelineItem[]) => {
  const allItems = getAllTimelineItems();
  const itemMap = new Map(allItems.map(i => [i.id, i]));
  const deletedIds = getPendingDeletes(); // Get list of items user deleted locally

  remoteItems.forEach(remoteItem => {
    // CRITICAL: If this item is marked as deleted locally, DO NOT restore it.
    if (deletedIds.includes(remoteItem.id)) {
      console.log(`[Storage] Ignoring remote item ${remoteItem.id} because it is pending deletion.`);
      return; 
    }

    const localItem = itemMap.get(remoteItem.id);
    
    // Smart Merge: Only overwrite if local is clean or new
    if (!localItem || localItem.syncStatus === 'synced') {
      itemMap.set(remoteItem.id, { ...remoteItem, syncStatus: 'synced' });
    }
  });
  
  const mergedItems = Array.from(itemMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedItems));
};

export const deleteTimelineItem = async (itemId: string): Promise<void> => {
  const allItems = getAllTimelineItems();
  const newItems = allItems.filter(i => i.id !== itemId);
  
  // Save new list
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  
  // Record the ID so we know to delete it from server during sync
  markLogAsDeleted(itemId);
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
        reject(new Error("File processing failed"));
      }
    };
    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsDataURL(file);
  });
};

export const saveAIReport = async (report: AIReport): Promise<void> => {
  const reports = getAIReports();
  const filtered = reports.filter(r => r.startDate !== report.startDate || r.endDate !== report.endDate);
  const newReports = [report, ...filtered];
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
