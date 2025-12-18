
import { getSession } from '../lib/auth';
import { redirect } from 'next/navigation';
import MainApp from '../components/MainApp';

export default async function Home() {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }

  return <MainApp username={session.username} />;
}
