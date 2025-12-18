
'use server';

import { cookies } from 'next/headers';
import { encrypt, getSession } from '../lib/auth';
import { uploadLogToDrive, fetchLogsByDate, deleteLogFromDrive } from '../lib/drive';
import { TimelineItem } from '../types';

export async function loginAction(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  let users: Record<string, string> = {};
  try {
    users = JSON.parse(process.env.APP_USERS || '{}');
  } catch (e) {
    return { success: false, message: '服务器配置错误' };
  }

  if (users[username] === password) {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const session = await encrypt({ username, expires });

    cookies().set('session', session, { expires, httpOnly: true, secure: true });
    return { success: true };
  }

  return { success: false, message: '用户名或密码错误' };
}

export async function logoutAction() {
  cookies().set('session', '', { expires: new Date(0) });
}

export async function syncLogAction(logItem: TimelineItem) {
  const session = await getSession();
  if (!session) return { success: false, message: '未授权' };

  try {
    const syncedItem = await uploadLogToDrive(session.username, logItem);
    return { success: true, syncedItem };
  } catch (error: any) {
    console.error('Google Drive Sync Error:', error);
    return { success: false, message: error?.message || '上传失败' };
  }
}

export async function deleteLogAction(date: string, logId: string) {
  const session = await getSession();
  if (!session) return { success: false, message: '未授权' };

  try {
    await deleteLogFromDrive(session.username, date, logId);
    return { success: true };
  } catch (error: any) {
    console.error('Delete Error:', error);
    return { success: false, message: error?.message || '删除失败' };
  }
}

export async function pullLogsFromDriveAction(date: string) {
  const session = await getSession();
  if (!session) return { success: false, message: '未授权' };

  try {
    const items = await fetchLogsByDate(session.username, date);
    return { success: true, items };
  } catch (error: any) {
    return { success: false, message: error?.message || '拉取失败' };
  }
}
