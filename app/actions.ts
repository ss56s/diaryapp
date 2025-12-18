'use server';

import { cookies } from 'next/headers';
import { encrypt, getSession } from '../lib/auth';
import { uploadLogToDrive } from '../lib/drive';
import { TimelineItem } from '../types';

export async function loginAction(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  // Fix: Explicitly type the users object to allow string indexing
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
    await uploadLogToDrive(session.username, logItem);
    return { success: true };
  } catch (error) {
    console.error('Google Drive Sync Error:', error);
    return { success: false, message: error.message || '上传失败' };
  }
}