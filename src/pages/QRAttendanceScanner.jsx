import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/constants';
import { Html5Qrcode } from 'html5-qrcode';

const soundSuccess = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

const soundDuplicate = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
};

const soundInvalid = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.setValueAtTime(100, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

export default function QRAttendanceScanner() {
  const { scanQRAttendance, endQRAttendance, qrAttendance, workers } = useApp();
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [resultType, setResultType] = useState('');
  const [lastWorker, setLastWorker] = useState(null);
  const [todayStats, setTodayStats] = useState({ present: 0, absent: 0, total: 0 });
  const [showEndModal, setShowEndModal] = useState(false);
  const [endResult, setEndResult] = useState(null);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const resultTimeoutRef = useRef(null);
  // Workers are queued up in front of the camera one after another, so the
  // video feed must never stop between scans - re-requesting the camera
  // stream for every single worker is exactly the "اضغط إنهاء وبدء من جديد"
  // problem. Instead of stopping the scanner after each decode, we just
  // ignore new decodes for a short cooldown window (so the same badge
  // still in frame isn't registered twice) while the camera keeps running.
  const isProcessingRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  const today = todayISO();

  const todayRecords = qrAttendance.filter(a => a.date === today);
  const todayPresent = todayRecords.filter(a => a.status === 'present').length;
  const activeWorkersCount = workers.filter(w => w.status === 'active').length;

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const handleScan = useCallback(async (decodedText) => {
    if (!decodedText) return;
    const now = Date.now();
    // Still-in-cooldown or a scan already being processed - ignore, don't
    // touch the camera at all.
    if (isProcessingRef.current || now < cooldownUntilRef.current) return;
    isProcessingRef.current = true;
    const trimmed = decodedText.trim();

    const res = await scanQRAttendance(trimmed, 'qr-scanner');

    if (res.type === 'success') {
      soundSuccess();
      setResult('تم تسجيل حضور');
      setResultType('success');
      setLastWorker(res.worker);
    } else if (res.type === 'duplicate') {
      soundDuplicate();
      setResult(res.message);
      setResultType('duplicate');
      setLastWorker(res.worker);
    } else if (res.type === 'error') {
      soundInvalid();
      setResult(res.message || 'حصل خطأ غير متوقع أثناء تسجيل الحضور');
      setResultType('error');
      setLastWorker(res.worker || null);
    } else {
      soundInvalid();
      setResult('QR غير صالح');
      setResultType('invalid');
      setLastWorker(null);
    }

    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => {
      setResult(null);
      setResultType('');
      setLastWorker(null);
    }, 3000);

    // Camera stays on the whole time - only block new decodes for a couple
    // seconds so the badge that's still sitting in frame doesn't get
    // registered a second time before the next worker steps up.
    cooldownUntilRef.current = Date.now() + 2000;
    isProcessingRef.current = false;
  }, [scanQRAttendance]);

  const startScanner = useCallback(async () => {
    if (isScanning) {
      await stopScanner();
      setIsScanning(false);
      return;
    }

    isProcessingRef.current = false;
    cooldownUntilRef.current = 0;

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {}
      );
      setIsScanning(true);
    } catch (err) {
      console.error('Scanner start error:', err);
      setResult('فشل في تشغيل الكاميرا');
      setResultType('invalid');
      setTimeout(() => { setResult(null); setResultType(''); }, 3000);
    }
  }, [isScanning, stopScanner, handleScan]);

  const handleEndAttendance = () => {
    endQRAttendance();
    const activeW = workers.filter(w => w.status === 'active');
    const todayRecordsAfter = qrAttendance.filter(a => a.date === today);
    const todayPresentCount = todayRecordsAfter.filter(a => a.status === 'present').length;
    setEndResult({
      present: todayPresentCount,
      absent: activeW.length - todayPresentCount,
      total: activeW.length,
    });
    setShowEndModal(true);
    setTimeout(() => { setShowEndModal(false); setEndResult(null); }, 5000);
  };

  useEffect(() => {
    return () => {
      stopScanner();
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, [stopScanner]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">QR Attendance</h2>
        <div className="flex gap-2">
          <button
            onClick={startScanner}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow ${
              isScanning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isScanning ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                إيقاف الكاميرا
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                بدء الحضور
              </>
            )}
          </button>
          <button
            onClick={handleEndAttendance}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2 shadow"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            إنهاء الحضور
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي العمال</p>
          <p className="text-2xl font-bold text-gray-800">{activeWorkersCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 text-center">
          <p className="text-xs text-green-600">الحاضرين اليوم</p>
          <p className="text-2xl font-bold text-green-700">{todayPresent}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500">تاريخ اليوم</p>
          <p className="text-sm font-bold text-gray-800">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col items-center">
          <div
            id="qr-reader"
            ref={containerRef}
            className="w-full max-w-md rounded-lg overflow-hidden mb-4"
            style={{ minHeight: isScanning ? '250px' : '80px' }}
          />

          {!isScanning && (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <p className="text-gray-400">اضغط "بدء الحضور" لتشغيل الكاميرا</p>
            </div>
          )}

          {result && (
            <div className={`w-full max-w-md p-4 rounded-xl text-center mb-4 ${
              resultType === 'success' ? 'bg-green-50 border-2 border-green-400' :
              resultType === 'duplicate' ? 'bg-yellow-50 border-2 border-yellow-400' :
              'bg-red-50 border-2 border-red-400'
            }`}>
              <div className={`text-3xl mb-2 ${
                resultType === 'success' ? 'text-green-600' :
                resultType === 'duplicate' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {resultType === 'success' ? '✅' : resultType === 'duplicate' ? '⚠️' : '❌'}
              </div>
              <p className={`text-lg font-bold ${
                resultType === 'success' ? 'text-green-700' :
                resultType === 'duplicate' ? 'text-yellow-700' :
                'text-red-700'
              }`}>{result}</p>
              {lastWorker && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-700"><span className="font-bold">الاسم:</span> {lastWorker.name}</p>
                  <p className="text-sm text-gray-700"><span className="font-bold">المهنة:</span> {lastWorker.role}</p>
                  <p className="text-sm text-gray-700"><span className="font-bold">الفئة:</span> يومية</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-gray-800">الحضور اليومي المباشر</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">المهنة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الفئة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">وقت الحضور</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todayRecords.filter(a => a.status === 'present').map((record, i) => (
                <tr key={record.id} className="hover:bg-green-50 transition">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{record.workerName}</td>
                  <td className="px-4 py-3">
                    <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">{record.workerRole}</span>
                  </td>
                  <td className="px-4 py-3">يومية</td>
                  <td className="px-4 py-3 font-mono" dir="ltr">{record.timeIn}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">حاضر</span>
                  </td>
                </tr>
              ))}
              {todayRecords.filter(a => a.status === 'present').length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">لم يتم تسجيل أي حضور بعد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showEndModal && endResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowEndModal(false); setEndResult(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-800 mb-6">ملخص الحضور اليوم</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-sm text-green-600">الحاضرين</p>
                <p className="text-3xl font-bold text-green-700">{endResult.present}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-sm text-red-600">الغائبين</p>
                <p className="text-3xl font-bold text-red-700">{endResult.absent}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">إجمالي العمال</p>
                <p className="text-3xl font-bold text-gray-800">{endResult.total}</p>
              </div>
            </div>
            <button onClick={() => { setShowEndModal(false); setEndResult(null); }}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إغلاق</button>
          </div>
        </div>
      )}
    </div>
  );
}
