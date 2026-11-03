import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Solana Sentinel | Observasi',description:'Terminal observasi Solana. Eksekusi dinonaktifkan.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="id"><body>{children}</body></html>;}
