import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import WorkersPage from './pages/WorkersPage';
import AttendancePage from './pages/AttendancePage';
import AdvancesPage from './pages/AdvancesPage';
import CustodyPage from './pages/CustodyPage';
import ExpensesPage from './pages/ExpensesPage';
import PurchasesPage from './pages/PurchasesPage';
import TransfersPage from './pages/TransfersPage';
import ExternalTransfersPage from './pages/ExternalTransfersPage';
import PillarsPage from './pages/PillarsPage';
import BudgetPage from './pages/BudgetPage';
import PayrollPage from './pages/PayrollPage';
import ReportsPage from './pages/ReportsPage';
import ExpensesReportPage from './pages/ExpensesReportPage';
import TimesheetPage from './pages/TimesheetPage';
import ContractorsPage from './pages/ContractorsPage';
import ContractorDetailPage from './pages/ContractorDetailPage';
import HousingPage from './pages/HousingPage';
import PhoneDirectoryPage from './pages/PhoneDirectoryPage';
import QRAttendanceScanner from './pages/QRAttendanceScanner';
import QRAttendanceReportsPage from './pages/QRAttendanceReportsPage';

function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500 text-lg">{children}</div>
    </div>
  );
}

// Accounts with user_metadata.role === 'qr_only' (the timekeeper/engineer
// login) can only ever land on /qr-attendance - any other URL, including
// the dashboard, bounces straight back there. This only gates navigation;
// it isn't a substitute for Supabase RLS, which is what actually stops
// this account reading/writing anything outside qr_attendance server-side.
function RoleGate({ children }) {
  const { userRole } = useApp();
  const location = useLocation();
  if (userRole === 'qr_only' && location.pathname !== '/qr-attendance') {
    return <Navigate to="/qr-attendance" replace />;
  }
  return children;
}

function PrivateRoute({ children }) {
  const { auth, authLoading, dataLoading, dataError, reloadData } = useApp();
  if (authLoading) return <FullScreenMessage>جارِ التحقق من الدخول...</FullScreenMessage>;
  if (!auth) return <Navigate to="/login" />;
  if (dataError) {
    return (
      <FullScreenMessage>
        <div className="text-center">
          <p className="text-red-600 mb-3">تعذر تحميل البيانات: {dataError}</p>
          <button onClick={reloadData} className="bg-primary-600 text-white px-4 py-2 rounded-lg">
            إعادة المحاولة
          </button>
        </div>
      </FullScreenMessage>
    );
  }
  if (dataLoading) return <FullScreenMessage>جارِ تحميل البيانات...</FullScreenMessage>;
  return children;
}

function AppRoutes() {
  const { auth, authLoading } = useApp();
  if (authLoading) return <FullScreenMessage>جارِ التحقق من الدخول...</FullScreenMessage>;
  return (
    <Routes>
      <Route path="/login" element={auth ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><RoleGate><Layout /></RoleGate></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="advances" element={<AdvancesPage />} />
        <Route path="custody" element={<CustodyPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="external-transfers" element={<ExternalTransfersPage />} />
        <Route path="pillars" element={<PillarsPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="timesheet" element={<TimesheetPage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="contractors/:id" element={<ContractorDetailPage />} />
        <Route path="housing" element={<HousingPage />} />
        <Route path="phone-directory" element={<PhoneDirectoryPage />} />
        <Route path="expenses-report" element={<ExpensesReportPage />} />
        <Route path="qr-attendance" element={<QRAttendanceScanner />} />
        <Route path="qr-attendance-reports" element={<QRAttendanceReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  );
}
