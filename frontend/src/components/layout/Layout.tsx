import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ScrollProgress } from './ScrollProgress';
import { ScrollToTop } from './ScrollToTop';
import { StorageNotice } from '../StorageNotice';

export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-canvas text-fg flex">
      <ScrollProgress />
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex-1 md:ml-64 flex flex-col w-full min-w-0">
        <Header toggleSidebar={() => setIsSidebarOpen(true)} />
        {/* Extra bottom space on phones so content can scroll clear of the floating controls. */}
        <main className="flex-1 p-4 pb-24 md:p-8 overflow-y-auto">
          {/* Keyed by route so each page fades up as it mounts. */}
          <div key={pathname} className="animate-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <ScrollToTop />
      {/* Offset past the fixed sidebar on desktop. */}
      <StorageNotice className="md:left-[17rem]" />
    </div>
  );
};
