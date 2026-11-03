import Dashboard from '../dashboard';
import { notFound } from 'next/navigation';
export default async function Page({params}:{params:Promise<{view?:string[]}>}) {
  const {view}=await params;
  const path=(view ?? []).join('/');
  if (!['','discover','agents','risk','wallets','audit','smart-wallets','copy-feed','rules','positions','trades','analytics','paper','setup','settings/integrations'].includes(path)) notFound();
  return <Dashboard view={path || 'overview'}/>;
}
