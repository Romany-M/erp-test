import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function QRAttendanceReportsPage() {
  const { qrAttendance, workers } = useApp();
  const [searchDate, setSearchDate] = useState('');
  const [searchMonth, setSearchMonth] = useState('');
  const [searchWorker, setSearchWorker] = useState('');

  const filtered = useMemo(() => {
    let list = [...qrAttendance];
    if (searchDate) {
      list = list.filter(a => a.date === searchDate);
    }
    if (searchMonth) {
      list = list.filter(a => a.date && a.date.startsWith(searchMonth));
    }
    if (searchWorker) {
      list = list.filter(a => a.workerName && a.workerName.includes(searchWorker));
    }
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.timeIn || '').localeCompare(a.timeIn || '');
    });
    return list;
  }, [qrAttendance, searchDate, searchMonth, searchWorker]);

  const stats = useMemo(() => {
    const dates = new Set(filtered.map(a => a.date));
    const present = filtered.filter(a => a.status === 'present').length;
    const absent = filtered.filter(a => a.status === 'absent').length;
    return { total: filtered.length, present, absent, days: dates.size };
  }, [filtered]);

  const handleExportExcel = () => {
    const data = filtered.map(a => ({
      'الاسم': a.workerName,
      'المهنة': a.workerRole,
      'التاريخ': a.date,
      'وقت الحضور': a.timeIn,
      'الحالة': a.status === 'present' ? 'حاضر' : 'غائب',
      'تم التسجيل بواسطة': a.createdBy,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'QR Attendance');
    XLSX.writeFile(wb, 'تقرير_حضور_QR.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('helvetica');
    doc.setFontSize(16);
    doc.text('QR Attendance Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Total: ${stats.total} | Present: ${stats.present} | Absent: ${stats.absent}`, 14, 30);

    const tableData = filtered.map(a => [
      a.workerName || '',
      a.workerRole || '',
      a.date || '',
      a.timeIn || '',
      a.status === 'present' ? 'Present' : 'Absent',
      a.createdBy || '',
    ]);

    doc.autoTable({
      startY: 35,
      head: [['Name', 'Role', 'Date', 'Time In', 'Status', 'Created By']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
    });

    doc.save('qr_attendance_report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">تقرير الحضور (QR)</h2>
        <div className="flex gap-2">
          <button onClick={handleExportExcel}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            تصدير Excel
          </button>
          <button onClick={handleExportPDF}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            تصدير PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">بحث بيوم</label>
            <input type="date" value={searchDate} onChange={e => { setSearchDate(e.target.value); setSearchMonth(''); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">بحث بالشهر</label>
            <input type="month" value={searchMonth} onChange={e => { setSearchMonth(e.target.value); setSearchDate(''); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">بحث بالعامل</label>
            <input type="text" placeholder="اسم العامل..." value={searchWorker} onChange={e => setSearchWorker(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي السجلات</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 text-center">
          <p className="text-xs text-green-600">الحاضرين</p>
          <p className="text-2xl font-bold text-green-700">{stats.present}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 text-center">
          <p className="text-xs text-red-600">الغائبين</p>
          <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500">عدد الأيام</p>
          <p className="text-2xl font-bold text-gray-800">{stats.days}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">المهنة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">وقت الحضور</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">الحالة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">تم التسجيل بواسطة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((record, i) => (
                <tr key={record.id} className={`hover:bg-gray-50 transition ${record.status === 'present' ? '' : 'bg-red-50/50'}`}>
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{record.workerName}</td>
                  <td className="px-4 py-3">
                    <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">{record.workerRole}</span>
                  </td>
                  <td className="px-4 py-3">{record.date}</td>
                  <td className="px-4 py-3 font-mono" dir="ltr">{record.timeIn}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      record.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {record.status === 'present' ? 'حاضر' : 'غائب'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{record.createdBy}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">لا توجد سجلات حضور</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 border-t">
          إجمالي: {filtered.length} سجل
        </div>
      </div>
    </div>
  );
}
