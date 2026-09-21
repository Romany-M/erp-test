import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const menuItems = [
  { path: '/', label: 'لوحة التحكم', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { path: '/workers', label: 'إدارة العمال', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { path: '/housing', label: 'السكن', icon: 'M3 18V6m0 8h18m0 4v-6a3 3 0 00-3-3h-8v6M7 10h.01' },
  { path: '/phone-directory', label: 'دليل الهاتف', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
  { path: '/attendance', label: 'الحضور والانصراف', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { path: '/advances', label: 'السلف', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { path: '/custody', label: 'العهد', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { path: '/expenses', label: 'المصروفات', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { path: '/purchases', label: 'المشتريات', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
  { path: '/transfers', label: 'تحويلات العمال', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { path: '/external-transfers', label: 'تحويلات خارجية', icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
  { path: '/pillars', label: 'المناطق والمباني', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { path: '/budget', label: 'الميزانية', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1' },
  { path: '/payroll', label: 'القبض', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { path: '/reports', label: 'التقارير الشاملة', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { path: '/timesheet', label: 'التايم شيت', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { path: '/contractors', label: 'مقاولين', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { path: '/expenses-report', label: 'تقرير المصروفات', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { path: '/qr-attendance', label: 'QR Attendance', icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
  { path: '/qr-attendance-reports', label: 'تقرير الحضور QR', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

export default function Layout() {
  const { logout, userRole } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The timekeeper/engineer login (user_metadata.role === 'qr_only') only
  // ever needs the one QR scanning screen - everything else is hidden so
  // there's nothing to tap into by mistake.
  const visibleMenuItems = userRole === 'qr_only'
    ? menuItems.filter(item => item.path === '/qr-attendance')
    : menuItems;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Lock background scroll while the mobile drawer is open, and make sure
  // the drawer always starts closed again if the viewport grows to desktop size.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl
          transform transition-transform duration-300 ease-in-out will-change-transform
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ height: '100dvh' }}
      >
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-sm">المناهري للمقاولات</h2>
              <p className="text-xs text-gray-500">نظام إدارة المشاريع</p>
            </div>
          </div>
        </div>

        <nav className="p-3 overflow-y-auto" style={{ height: 'calc(100dvh - 180px)' }}>
          {visibleMenuItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 text-sm transition-all duration-200
                ${isActive
                  ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }
              `}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:mr-72">
        <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-30 no-print">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="فتح القائمة"
              className="lg:hidden -m-2 p-2.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800 hidden lg:block">المناهري للمقاولات العمومية</h1>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
