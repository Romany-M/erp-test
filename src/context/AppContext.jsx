import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generateWorkerCode, todayISO } from '../utils/constants';

const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

// ------------------------------------------------------------------
// camelCase (JS) <-> snake_case (Postgres) field mapping per table.
// Keeping this table-driven means every page component can go on
// reading/writing the exact same camelCase shape it always has.
// ------------------------------------------------------------------
const MAPS = {
  workers: [
    ['id', 'id'], ['code', 'code'], ['name', 'name'], ['role', 'role'],
    ['dailyWage', 'daily_wage'], ['status', 'status'], ['phone', 'phone'],
    ['notes', 'notes'], ['walletNumber', 'wallet_number'], ['walletName', 'wallet_name'],
    ['apartmentId', 'apartment_id'], ['createdAt', 'created_at'],
  ],
  attendance: [
    ['id', 'id'], ['workerId', 'worker_id'], ['workerName', 'worker_name'],
    ['workerCode', 'worker_code'], ['role', 'role'], ['date', 'date'],
    ['status', 'status'], ['overtimeFraction', 'overtime_fraction'],
    ['overtimeValue', 'overtime_value'], ['pillarCost', 'pillar_cost'],
    ['deduction', 'deduction'], ['createdAt', 'created_at'],
  ],
  advances: [
    ['id', 'id'], ['workerId', 'worker_id'], ['date', 'date'], ['amount', 'amount'],
    ['paymentType', 'payment_type'], ['notes', 'notes'], ['createdAt', 'created_at'],
  ],
  custody: [
    ['id', 'id'], ['workerId', 'worker_id'], ['date', 'date'], ['amount', 'amount'],
    ['paymentType', 'payment_type'], ['notes', 'notes'], ['createdAt', 'created_at'],
  ],
  food_expenses: [
    ['id', 'id'], ['date', 'date'], ['supplier', 'supplier'], ['category', 'category'],
    ['totalAmount', 'total_amount'],
    ['paymentType', 'payment_type'], ['notes', 'notes'], ['createdAt', 'created_at'],
  ],
  purchases: [
    ['id', 'id'], ['date', 'date'], ['item', 'item'], ['supplier', 'supplier'],
    ['amount', 'amount'], ['paymentType', 'payment_type'], ['notes', 'notes'], ['createdAt', 'created_at'],
  ],
  transfers: [
    ['id', 'id'], ['workerId', 'worker_id'], ['date', 'date'], ['time', 'time'],
    ['phone', 'phone'], ['amount', 'amount'], ['transactionId', 'transaction_id'],
    ['walletName', 'wallet_name'], ['notes', 'notes'], ['paymentType', 'payment_type'],
    ['createdAt', 'created_at'],
  ],
  external_transfers: [
    ['id', 'id'], ['date', 'date'], ['recipient', 'recipient'], ['phone', 'phone'],
    ['amount', 'amount'], ['transactionId', 'transaction_id'], ['walletName', 'wallet_name'],
    ['notes', 'notes'], ['paymentType', 'payment_type'], ['createdAt', 'created_at'],
  ],
  plots: [
    ['id', 'id'], ['name', 'name'], ['createdAt', 'created_at'],
  ],
  pillar_buildings: [
    ['id', 'id'], ['plotId', 'plot_id'], ['name', 'name'], ['createdAt', 'created_at'],
  ],
  pillars: [
    ['id', 'id'], ['workerId', 'worker_id'], ['buildingId', 'building_id'], ['date', 'date'],
    ['stage', 'stage'], ['cost', 'cost'], ['supervisor', 'supervisor'], ['notes', 'notes'],
    ['paymentType', 'payment_type'], ['createdAt', 'created_at'],
  ],
  payments: [
    ['id', 'id'], ['workerId', 'worker_id'], ['workerName', 'worker_name'], ['amount', 'amount'],
    ['paymentType', 'payment_type'], ['dateFrom', 'date_from'], ['dateTo', 'date_to'], ['date', 'date'],
  ],
  qr_codes: [
    ['id', 'id'], ['workerId', 'worker_id'], ['employeeId', 'employee_id'], ['createdAt', 'created_at'],
  ],
  qr_attendance: [
    ['id', 'id'], ['employeeId', 'employee_id'], ['workerId', 'worker_id'], ['workerName', 'worker_name'],
    ['workerRole', 'worker_role'], ['date', 'date'], ['timeIn', 'time_in'], ['status', 'status'],
    ['createdBy', 'created_by'], ['createdAt', 'created_at'],
  ],
  contractors: [
    ['id', 'id'], ['name', 'name'], ['role', 'role'], ['createdAt', 'created_at'],
  ],
  contractor_payments: [
    ['id', 'id'], ['contractorId', 'contractor_id'], ['date', 'date'], ['amount', 'amount'],
    ['paymentType', 'payment_type'], ['paidBy', 'paid_by'], ['paid', 'paid'],
    ['paidAt', 'paid_at'], ['createdAt', 'created_at'],
  ],
  budget_history: [
    ['id', 'id'], ['type', 'type'], ['amount', 'amount'], ['action', 'action'], ['date', 'date'],
  ],
  weekly_budgets: [
    ['id', 'id'], ['weekStart', 'week_start'], ['type', 'type'], ['amount', 'amount'],
    ['updatedAt', 'updated_at'],
  ],
  housing_apartments: [
    ['id', 'id'], ['buildingName', 'building_name'], ['area', 'area'],
    ['apartmentNumber', 'apartment_number'], ['rooms', 'rooms'], ['notes', 'notes'],
    ['createdAt', 'created_at'],
  ],
};

// UUID foreign-key columns per table: empty strings must become NULL
// before being sent to Postgres, or the insert/update fails outright.
const UUID_FIELDS = {
  workers: ['apartmentId'],
  attendance: ['workerId'],
  advances: ['workerId'],
  custody: ['workerId'],
  food_expenses: [],
  purchases: [],
  transfers: ['workerId'],
  external_transfers: [],
  plots: [],
  pillar_buildings: ['plotId'],
  pillars: ['workerId', 'buildingId'],
  payments: ['workerId'],
  qr_codes: ['workerId'],
  qr_attendance: ['workerId'],
  contractors: [],
  contractor_payments: ['contractorId'],
  budget_history: [],
  housing_apartments: [],
  weekly_budgets: [],
};

function toDb(table, obj) {
  const pairs = MAPS[table];
  const uuidFields = new Set(UUID_FIELDS[table] || []);
  const out = {};
  for (const [js, db] of pairs) {
    if (!(js in obj)) continue;
    let val = obj[js];
    if (uuidFields.has(js) && val === '') val = null;
    out[db] = val;
  }
  return out;
}

function fromDb(table, row) {
  if (!row) return row;
  const pairs = MAPS[table];
  const out = {};
  for (const [js, db] of pairs) {
    out[js] = row[db];
  }
  return out;
}

function fromDbList(table, rows) {
  return (rows || []).map(r => fromDb(table, r));
}

const initialState = {
  workers: [],
  attendance: [],
  advances: [],
  custody: [],
  foodExpenses: [],
  purchases: [],
  transfers: [],
  externalTransfers: [],
  pillars: [],
  budgets: { cash: 0, insta: 0 },
  budgetHistory: [],
  payments: [],
  pillarBuildings: [],
  plots: [],
  qrCodes: [],
  qrAttendance: [],
  contractors: [],
  contractorPayments: [],
  housingApartments: [],
  weeklyBudgets: [],
  payrollRange: { from: '', to: '' },
};

export function AppProvider({ children }) {
  const [auth, setAuth] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [state, setState] = useState(initialState);
  const loadedForUserRef = useRef(null);

  // ---------------- Auth wiring ----------------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuth(!!data.session);
      setUserRole(data.session?.user?.user_metadata?.role || null);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(!!session);
      setUserRole(session?.user?.user_metadata?.role || null);
      setAuthLoading(false);
      if (!session) {
        setState(initialState);
        loadedForUserRef.current = null;
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Engineers get a plain username (no "@"), typed exactly as created in
  // Supabase Auth (e.g. "timekeeper") - Supabase's email/password auth still
  // needs an email-shaped identifier under the hood, so a fixed internal
  // domain is appended here rather than asking every foreman to remember
  // a fake email address.
  const USERNAME_LOGIN_DOMAIN = 'login.almanahri.internal';
  const login = useCallback(async (identifier, password) => {
    const email = identifier.includes('@') ? identifier : `${identifier.trim()}@${USERNAME_LOGIN_DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ---------------- Initial data load ----------------
  // PostgREST silently caps any select('*') at the project's "Max Rows"
  // setting (default 1000) with NO error - it just returns a partial
  // result. Tables that grow past that (attendance, above all: up to
  // ~500 rows/day) would then load truncated after a few days, and any
  // worker+date missing from that truncated set falls back to the
  // AttendancePage default of status:'absent' - i.e. "everyone shows
  // absent" / "yesterday's records disappeared" even though the rows are
  // still sitting untouched in the database. fetchAllRows pages through
  // with .range() until a page comes back short, so every row is always
  // loaded regardless of table size.
  const fetchAllRows = useCallback(async (table, { orderBy } = {}) => {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    for (;;) {
      let query = supabase.from(table).select('*').range(from, from + pageSize - 1);
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const { data, error } = await query;
      if (error) return { data: null, error };
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return { data: all, error: null };
  }, []);

  const loadAllData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [
        workersRes, attendanceRes, advancesRes, custodyRes, foodRes, purchasesRes,
        transfersRes, externalRes, pillarsRes, budgetsRes, budgetHistoryRes,
        paymentsRes, buildingsRes, plotsRes, qrCodesRes, qrAttendanceRes,
        contractorsRes, contractorPaymentsRes, payrollRangeRes, housingRes, weeklyBudgetsRes,
      ] = await Promise.all([
        fetchAllRows('workers', { orderBy: { column: 'created_at', ascending: true } }),
        fetchAllRows('attendance'),
        supabase.from('advances').select('*'),
        supabase.from('custody').select('*'),
        supabase.from('food_expenses').select('*'),
        supabase.from('purchases').select('*'),
        supabase.from('transfers').select('*'),
        supabase.from('external_transfers').select('*'),
        supabase.from('pillars').select('*'),
        supabase.from('budgets').select('*'),
        supabase.from('budget_history').select('*'),
        supabase.from('payments').select('*'),
        supabase.from('pillar_buildings').select('*'),
        supabase.from('plots').select('*'),
        supabase.from('qr_codes').select('*'),
        fetchAllRows('qr_attendance'),
        supabase.from('contractors').select('*'),
        supabase.from('contractor_payments').select('*'),
        supabase.from('payroll_range').select('*').maybeSingle(),
        supabase.from('housing_apartments').select('*'),
        supabase.from('weekly_budgets').select('*'),
      ]);

      const results = [
        workersRes, attendanceRes, advancesRes, custodyRes, foodRes, purchasesRes,
        transfersRes, externalRes, pillarsRes, budgetsRes, budgetHistoryRes,
        paymentsRes, buildingsRes, plotsRes, qrCodesRes, qrAttendanceRes,
        contractorsRes, contractorPaymentsRes,
      ];
      const firstError = results.find(r => r.error)?.error || payrollRangeRes.error;
      if (firstError) throw firstError;

      // السكن قسم اختياري: لو جدول الشقق لسه ما اتعملش في Supabase، بنكمل
      // تحميل باقي النظام عادي (بدل ما الشاشة كلها تقع) ونكتب تحذير في الـ console.
      if (housingRes.error) {
        console.warn('housing_apartments not available yet - run the housing SQL migration:', housingRes.error);
      }

      if (weeklyBudgetsRes.error) {
        console.warn('weekly_budgets not available yet - run the weekly budget SQL migration:', weeklyBudgetsRes.error);
      }

      const budgetsMap = { cash: 0, insta: 0 };
      (budgetsRes.data || []).forEach(b => { budgetsMap[b.type] = Number(b.amount) || 0; });

      setState({
        workers: fromDbList('workers', workersRes.data),
        attendance: fromDbList('attendance', attendanceRes.data),
        advances: fromDbList('advances', advancesRes.data),
        custody: fromDbList('custody', custodyRes.data),
        foodExpenses: fromDbList('food_expenses', foodRes.data),
        purchases: fromDbList('purchases', purchasesRes.data),
        transfers: fromDbList('transfers', transfersRes.data),
        externalTransfers: fromDbList('external_transfers', externalRes.data),
        pillars: fromDbList('pillars', pillarsRes.data),
        budgets: budgetsMap,
        budgetHistory: fromDbList('budget_history', budgetHistoryRes.data),
        payments: fromDbList('payments', paymentsRes.data),
        pillarBuildings: fromDbList('pillar_buildings', buildingsRes.data),
        plots: fromDbList('plots', plotsRes.data),
        qrCodes: fromDbList('qr_codes', qrCodesRes.data),
        qrAttendance: fromDbList('qr_attendance', qrAttendanceRes.data),
        contractors: fromDbList('contractors', contractorsRes.data),
        contractorPayments: fromDbList('contractor_payments', contractorPaymentsRes.data),
        housingApartments: housingRes.error ? [] : fromDbList('housing_apartments', housingRes.data),
        weeklyBudgets: weeklyBudgetsRes.error ? [] : fromDbList('weekly_budgets', weeklyBudgetsRes.data),
        payrollRange: {
          from: payrollRangeRes.data?.date_from || '',
          to: payrollRangeRes.data?.date_to || '',
        },
      });
    } catch (err) {
      console.error('Failed to load ERP data:', err);
      setDataError(err.message || 'تعذر تحميل البيانات');
    } finally {
      setDataLoading(false);
    }
  }, [fetchAllRows]);

  useEffect(() => {
    if (auth && loadedForUserRef.current !== true) {
      loadedForUserRef.current = true;
      loadAllData();
    }
  }, [auth, loadAllData]);

  // ---------------- Generic CRUD helpers ----------------
  const insertRow = useCallback(async (table, stateKey, jsObj, extra = {}) => {
    const dbObj = { ...toDb(table, jsObj), ...extra };
    const { data, error } = await supabase.from(table).insert(dbObj).select().single();
    if (error) { console.error(`insert ${table} failed:`, error); throw error; }
    const row = fromDb(table, data);
    setState(prev => ({ ...prev, [stateKey]: [...prev[stateKey], row] }));
    return row;
  }, []);

  const updateRow = useCallback(async (table, stateKey, id, jsPatch) => {
    const dbPatch = toDb(table, jsPatch);
    const { data, error } = await supabase.from(table).update(dbPatch).eq('id', id).select().single();
    if (error) { console.error(`update ${table} failed:`, error); throw error; }
    const row = fromDb(table, data);
    setState(prev => ({
      ...prev,
      [stateKey]: prev[stateKey].map(r => (r.id === id ? row : r)),
    }));
    return row;
  }, []);

  const deleteRow = useCallback(async (table, stateKey, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { console.error(`delete ${table} failed:`, error); throw error; }
    setState(prev => ({
      ...prev,
      [stateKey]: prev[stateKey].filter(r => r.id !== id),
    }));
  }, []);

  // ---------------- Workers ----------------
  const addWorker = useCallback(async (worker) => {
    if (state.workers.some(w => w.name === worker.name)) return null;
    const code = generateWorkerCode(state.workers);
    return insertRow('workers', 'workers', { ...worker, code });
  }, [state.workers, insertRow]);

  const addWorkersBulk = useCallback(async (workersList) => {
    const existingNames = new Set(state.workers.map(w => w.name));
    let code = state.workers.length > 0
      ? Math.max(...state.workers.map(w => parseInt(w.code?.replace('W', '') || '0'))) + 1
      : 1;

    const rows = [];
    for (const w of workersList) {
      if (!existingNames.has(w.name)) {
        existingNames.add(w.name);
        rows.push(toDb('workers', {
          ...w,
          code: 'W' + String(code).padStart(4, '0'),
          status: w.status || 'active',
          notes: w.notes || '',
          phone: w.phone || '',
        }));
        code++;
      }
    }
    if (rows.length === 0) return;
    const { data, error } = await supabase.from('workers').insert(rows).select();
    if (error) { console.error('bulk insert workers failed:', error); throw error; }
    const newWorkers = fromDbList('workers', data);
    setState(prev => ({ ...prev, workers: [...prev.workers, ...newWorkers] }));
  }, [state.workers]);

  const updateWorker = useCallback(async (id, data) => {
    if (data.name && state.workers.some(w => w.name === data.name && w.id !== id)) return;
    await updateRow('workers', 'workers', id, data);
  }, [state.workers, updateRow]);

  const deleteWorker = useCallback((id) => deleteRow('workers', 'workers', id), [deleteRow]);

  // ---------------- Attendance ----------------
  const addAttendance = useCallback(async (record) => {
    const existing = state.attendance.find(a => a.workerId === record.workerId && a.date === record.date);
    if (existing) {
      await updateRow('attendance', 'attendance', existing.id, record);
    } else {
      await insertRow('attendance', 'attendance', record);
    }
  }, [state.attendance, insertRow, updateRow]);

  const addAttendanceBulk = useCallback(async (records) => {
    // Rows for workers who already have an attendance record for this date
    // (real id, goes through as an update) must NEVER be sent in the same
    // batch as rows for workers being recorded for the first time (no id
    // at all). Supabase/PostgREST derives one shared column set for the
    // whole array - if any row in the batch carries an `id`, every other
    // row in that same request gets an explicit `id: null`, which violates
    // the NOT NULL constraint instead of letting the DB generate a new id.
    const updateRows = [];
    const insertRows = [];
    records.forEach(r => {
      const existing = state.attendance.find(a => a.workerId === r.workerId && a.date === r.date);
      const dbRow = toDb('attendance', r);
      if (existing) {
        updateRows.push({ ...dbRow, id: existing.id });
      } else {
        insertRows.push(dbRow); // no `id` key at all -> DB default fills it in
      }
    });

    const results = [];
    if (updateRows.length > 0) {
      const { data, error } = await supabase
        .from('attendance')
        .upsert(updateRows, { onConflict: 'worker_id,date' })
        .select();
      if (error) { console.error('bulk attendance update failed:', error); throw error; }
      results.push(...data);
    }
    if (insertRows.length > 0) {
      // upsert (not insert) here too: if a concurrent save already created
      // this worker+date row moments ago, this falls back to an update
      // instead of hitting the unique constraint and failing outright.
      const { data, error } = await supabase
        .from('attendance')
        .upsert(insertRows, { onConflict: 'worker_id,date' })
        .select();
      if (error) { console.error('bulk attendance insert failed:', error); throw error; }
      results.push(...data);
    }

    const upserted = fromDbList('attendance', results);
    setState(prev => {
      const next = [...prev.attendance];
      upserted.forEach(rec => {
        const idx = next.findIndex(a => a.workerId === rec.workerId && a.date === rec.date);
        if (idx >= 0) next[idx] = rec; else next.push(rec);
      });
      return { ...prev, attendance: next };
    });
  }, [state.attendance]);

  const deleteAttendanceForDate = useCallback(async (date) => {
    const { error } = await supabase.from('attendance').delete().eq('date', date);
    if (error) { console.error(error); throw error; }
    setState(prev => ({ ...prev, attendance: prev.attendance.filter(a => a.date !== date) }));
  }, []);

  const clearOvertimeForDate = useCallback(async (date) => {
    const { data, error } = await supabase
      .from('attendance')
      .update({ overtime_value: 0, overtime_fraction: '' })
      .eq('date', date)
      .select();
    if (error) { console.error(error); throw error; }
    const updated = fromDbList('attendance', data);
    setState(prev => ({
      ...prev,
      attendance: prev.attendance.map(a => {
        const match = updated.find(u => u.id === a.id);
        return match ? match : a;
      }),
    }));
  }, []);

  // ---------------- Advances ----------------
  const addAdvance = useCallback((advance) => insertRow('advances', 'advances', advance), [insertRow]);

  const upsertAdvance = useCallback(async (advance) => {
    const existing = state.advances.find(a => a.workerId === advance.workerId && a.date === advance.date);
    if (existing) {
      await updateRow('advances', 'advances', existing.id, advance);
    } else {
      await insertRow('advances', 'advances', advance);
    }
  }, [state.advances, insertRow, updateRow]);

  const deleteAdvance = useCallback((id) => deleteRow('advances', 'advances', id), [deleteRow]);

  const deleteAdvancesForDate = useCallback(async (date) => {
    const { error } = await supabase.from('advances').delete().eq('date', date);
    if (error) { console.error(error); throw error; }
    setState(prev => ({ ...prev, advances: prev.advances.filter(a => a.date !== date) }));
  }, []);

  // ---------------- Custody / Food / Purchases ----------------
  const addCustody = useCallback((item) => insertRow('custody', 'custody', item), [insertRow]);
  const deleteCustody = useCallback((id) => deleteRow('custody', 'custody', id), [deleteRow]);

  const addFoodExpense = useCallback((expense) => insertRow('food_expenses', 'foodExpenses', expense), [insertRow]);
  const deleteFoodExpense = useCallback((id) => deleteRow('food_expenses', 'foodExpenses', id), [deleteRow]);

  const addPurchase = useCallback((purchase) => insertRow('purchases', 'purchases', purchase), [insertRow]);
  const deletePurchase = useCallback((id) => deleteRow('purchases', 'purchases', id), [deleteRow]);

  // ---------------- Transfers ----------------
  const addTransfer = useCallback((transfer) => insertRow('transfers', 'transfers', transfer), [insertRow]);
  const updateTransfer = useCallback((id, data) => updateRow('transfers', 'transfers', id, data), [updateRow]);
  const deleteTransfer = useCallback((id) => deleteRow('transfers', 'transfers', id), [deleteRow]);

  const addExternalTransfer = useCallback(
    (transfer) => insertRow('external_transfers', 'externalTransfers', transfer), [insertRow]);
  const deleteExternalTransfer = useCallback(
    (id) => deleteRow('external_transfers', 'externalTransfers', id), [deleteRow]);

  // ---------------- Pillars / plots / buildings ----------------
  const addPillar = useCallback((record) => insertRow('pillars', 'pillars', record), [insertRow]);
  const deletePillar = useCallback((id) => deleteRow('pillars', 'pillars', id), [deleteRow]);

  const addBuilding = useCallback(
    (building) => insertRow('pillar_buildings', 'pillarBuildings', building), [insertRow]);
  const updateBuilding = useCallback(
    (id, data) => updateRow('pillar_buildings', 'pillarBuildings', id, data), [updateRow]);
  const deleteBuilding = useCallback(
    (id) => deleteRow('pillar_buildings', 'pillarBuildings', id), [deleteRow]);

  const addPlot = useCallback((plot) => insertRow('plots', 'plots', plot), [insertRow]);
  const updatePlot = useCallback((id, data) => updateRow('plots', 'plots', id, data), [updateRow]);
  const deletePlot = useCallback((id) => deleteRow('plots', 'plots', id), [deleteRow]);

  // ---------------- Budget ----------------
  const updateBudget = useCallback(async (type, amount) => {
    const { error: upErr } = await supabase
      .from('budgets')
      .update({ amount, updated_at: new Date().toISOString() })
      .eq('type', type);
    if (upErr) { console.error(upErr); throw upErr; }

    const { data, error } = await supabase
      .from('budget_history')
      .insert({ type, amount, action: 'set' })
      .select()
      .single();
    if (error) { console.error(error); throw error; }
    const historyRow = fromDb('budget_history', data);

    setState(prev => ({
      ...prev,
      budgets: { ...prev.budgets, [type]: amount },
      budgetHistory: [...prev.budgetHistory, historyRow],
    }));
  }, []);

  // ---------------- Payments (payroll payouts) ----------------
  const addPayment = useCallback((payment) => insertRow('payments', 'payments', payment), [insertRow]);
  const deletePayment = useCallback((id) => deleteRow('payments', 'payments', id), [deleteRow]);

  const setPayrollRange = useCallback(async (range) => {
    const { error } = await supabase
      .from('payroll_range')
      .update({ date_from: range.from || null, date_to: range.to || null })
      .eq('id', true);
    if (error) { console.error(error); throw error; }
    setState(prev => ({ ...prev, payrollRange: range }));
  }, []);

  // ---------------- QR attendance ----------------
  const generateQRCode = useCallback(async (workerId) => {
    if (state.qrCodes.some(q => q.workerId === workerId)) return;
    const worker = state.workers.find(w => w.id === workerId);
    if (!worker) return;
    const employeeId = worker.code.replace('W', 'EMP');
    await insertRow('qr_codes', 'qrCodes', { workerId, employeeId });
  }, [state.qrCodes, state.workers, insertRow]);

  const scanQRAttendance = useCallback(async (employeeId, createdBy) => {
    const today = todayISO();
    const qrCode = state.qrCodes.find(q => q.employeeId === employeeId);
    if (!qrCode) {
      return { success: false, type: 'invalid', message: 'QR غير صالح', worker: null };
    }
    const worker = state.workers.find(w => w.id === qrCode.workerId);
    if (!worker) {
      return { success: false, type: 'invalid', message: 'QR غير صالح', worker: null };
    }
    // A row already existing for employeeId+today is only a REAL duplicate
    // if it's an actual scan (status 'present'). "إنهاء الحضور" bulk-inserts
    // an 'absent' placeholder row (time_in: '-') for every worker who
    // hadn't been scanned yet by the time that button was pressed - if that
    // happened even a bit early, every one of those workers would look
    // "already registered" forever afterward, even though nobody ever
    // actually scanned them. Only block on a genuine prior scan.
    const existingRecord = state.qrAttendance.find(a => a.employeeId === employeeId && a.date === today);
    if (existingRecord && existingRecord.status === 'present') {
      return {
        success: false,
        type: 'duplicate',
        message: `تم تسجيل حضور هذا العامل بالفعل الساعة ${existingRecord.timeIn}`,
        worker,
        existingTime: existingRecord.timeIn,
      };
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    // These are two separate writes with two very different failure
    // meanings, so they get two separate try/catches:
    //   1) the qr_attendance insert - a failure here (unique constraint on
    //      employee_id+date) is a genuine duplicate scan.
    //   2) mirroring into the main attendance table - a failure here is an
    //      unrelated problem (bad column, RLS, etc.) that has nothing to do
    //      with whether this scan was a duplicate.
    // Before this fix, both were wrapped in ONE try/catch that blindly
    // reported every failure as "تم تسجيل حضور هذا العامل بالفعل" - so a
    // real, unrelated bug in step 2 made EVERY single scan look like a
    // duplicate, even for a worker being scanned for the first time ever.
    try {
      if (existingRecord) {
        // An 'absent' placeholder already occupies this employee_id+date
        // (created by "إنهاء الحضور" before this worker was scanned) -
        // flip it to a real present scan instead of inserting a second row,
        // which the unique constraint would reject outright.
        await updateRow('qr_attendance', 'qrAttendance', existingRecord.id, {
          workerName: worker.name,
          workerRole: worker.role,
          timeIn: timeStr,
          status: 'present',
          createdBy,
        });
      } else {
        await insertRow('qr_attendance', 'qrAttendance', {
          employeeId,
          workerId: qrCode.workerId,
          workerName: worker.name,
          workerRole: worker.role,
          date: today,
          timeIn: timeStr,
          status: 'present',
          createdBy,
        });
      }
    } catch (err) {
      console.error('QR scan: qr_attendance insert failed:', err);
      // Only a genuine unique-constraint conflict (employee_id + date
      // already exists) is an actual duplicate scan. Anything else - a
      // missing column, an RLS policy rejecting the write, a network
      // error - is a real problem and must say so plainly instead of
      // pretending the worker was already scanned, or it becomes
      // impossible to tell "already scanned" apart from "something is
      // broken and nobody can be scanned at all".
      if (err?.code === '23505') {
        return {
          success: false,
          type: 'duplicate',
          message: 'تم تسجيل حضور هذا العامل بالفعل',
          worker,
          existingTime: null,
        };
      }
      return {
        success: false,
        type: 'error',
        message: `حصل خطأ أثناء تسجيل الحضور: ${err?.message || 'خطأ غير معروف'}`,
        worker,
        existingTime: null,
      };
    }

    // The QR log above only ever fed the "الحضور اليومي المباشر" table on
    // the scanner screen - it never touched the main `attendance` table
    // that AttendancePage, payroll, and the reports actually read from.
    // That's why a scanned worker showed up as "scanned" here but still
    // counted as absent everywhere else. Mirror the scan into the real
    // attendance record too, without touching any overtime/pillar/
    // deduction someone may have already entered for this worker today.
    //
    // If this mirror write fails, the QR check-in itself already succeeded
    // (the line above landed) - report success either way, but log the
    // failure loudly so it doesn't fail silently forever. A worker missing
    // from AttendancePage despite a successful scan now shows up in the
    // browser console instead of masquerading as a duplicate-scan error.
    try {
      const existingMain = state.attendance.find(a => a.workerId === worker.id && a.date === today);
      if (existingMain) {
        await addAttendance({ workerId: worker.id, date: today, status: 'present' });
      } else {
        await addAttendance({
          workerId: worker.id,
          workerName: worker.name,
          workerCode: worker.code,
          role: worker.role,
          date: today,
          status: 'present',
          overtimeFraction: '',
          overtimeValue: 0,
          pillarCost: 0,
          deduction: 0,
        });
      }
    } catch (err) {
      console.error('QR scan: mirroring into main attendance table failed (scan itself still succeeded):', err);
    }

    return { success: true, type: 'success', message: 'تم تسجيل حضور', worker };
  }, [state.qrCodes, state.workers, state.qrAttendance, state.attendance, insertRow, updateRow, addAttendance]);

  const endQRAttendance = useCallback(async () => {
    const today = todayISO();
    const activeWorkers = state.workers.filter(w => w.status === 'active');
    const todayPresent = new Set(
      state.qrAttendance.filter(a => a.date === today && a.status === 'present').map(a => a.workerId)
    );

    const newRows = [];
    activeWorkers.forEach(worker => {
      if (!todayPresent.has(worker.id)) {
        const qrCode = state.qrCodes.find(q => q.workerId === worker.id);
        newRows.push(toDb('qr_attendance', {
          employeeId: qrCode ? qrCode.employeeId : `no-qr-${worker.id}`,
          workerId: worker.id,
          workerName: worker.name,
          workerRole: worker.role,
          date: today,
          timeIn: '-',
          status: 'absent',
          createdBy: 'system',
        }));
      }
    });

    if (newRows.length === 0) return;
    const { data, error } = await supabase.from('qr_attendance').insert(newRows).select();
    if (error) { console.error('endQRAttendance failed:', error); throw error; }
    const inserted = fromDbList('qr_attendance', data);
    setState(prev => ({ ...prev, qrAttendance: [...prev.qrAttendance, ...inserted] }));
  }, [state.workers, state.qrAttendance, state.qrCodes]);

  const deleteQRCode = useCallback(async (workerId) => {
    const { error } = await supabase.from('qr_codes').delete().eq('worker_id', workerId);
    if (error) { console.error(error); throw error; }
    setState(prev => ({ ...prev, qrCodes: prev.qrCodes.filter(q => q.workerId !== workerId) }));
  }, []);

  // ---------------- Contractors ----------------
  const addContractor = useCallback((contractor) => insertRow('contractors', 'contractors', contractor), [insertRow]);
  const deleteContractor = useCallback(async (id) => {
    await deleteRow('contractors', 'contractors', id);
    setState(prev => ({
      ...prev,
      contractorPayments: prev.contractorPayments.filter(p => p.contractorId !== id),
    }));
  }, [deleteRow]);

  const addContractorPayment = useCallback(
    (payment) => insertRow('contractor_payments', 'contractorPayments', { ...payment, paid: false }),
    [insertRow]
  );
  const deleteContractorPayment = useCallback(
    (id) => deleteRow('contractor_payments', 'contractorPayments', id), [deleteRow]);

  const markContractorPaid = useCallback(async (contractorId) => {
    const unpaid = state.contractorPayments.filter(p => p.contractorId === contractorId && !p.paid);
    if (unpaid.length === 0) return;

    await Promise.all(unpaid.map(p =>
      supabase.from('contractor_payments').update({ paid: true, paid_at: p.date }).eq('id', p.id)
    ));

    setState(prev => ({
      ...prev,
      contractorPayments: prev.contractorPayments.map(p =>
        (p.contractorId === contractorId && !p.paid) ? { ...p, paid: true, paidAt: p.date } : p
      ),
    }));
  }, [state.contractorPayments]);

  // ---------------- Weekly budgets (ميزانية كل أسبوع) ----------------
  // ميزانية لكل أسبوع (سبت→جمعة) ولكل نوع (cash / insta). weekStart = تاريخ السبت.
  const setWeeklyBudget = useCallback(async (weekStart, type, amount) => {
    const { data, error } = await supabase
      .from('weekly_budgets')
      .upsert(
        { week_start: weekStart, type, amount, updated_at: new Date().toISOString() },
        { onConflict: 'week_start,type' }
      )
      .select()
      .single();
    if (error) { console.error('set weekly budget failed:', error); throw error; }
    const row = fromDb('weekly_budgets', data);
    setState(prev => {
      const rest = prev.weeklyBudgets.filter(b => !(b.weekStart === weekStart && b.type === type));
      return { ...prev, weeklyBudgets: [...rest, row] };
    });
    return row;
  }, []);

  // ---------------- Housing (السكن) ----------------
  const addApartment = useCallback(
    (apartment) => insertRow('housing_apartments', 'housingApartments', apartment), [insertRow]);
  const updateApartment = useCallback(
    (id, data) => updateRow('housing_apartments', 'housingApartments', id, data), [updateRow]);

  // الـ FK على workers.apartment_id هو on delete set null، فالعمال بيتفكّوا من
  // الشقة في الداتابيز لوحدهم - هنا بس بنعمل نفس الشيء في الـ state المحلي.
  const deleteApartment = useCallback(async (id) => {
    await deleteRow('housing_apartments', 'housingApartments', id);
    setState(prev => ({
      ...prev,
      workers: prev.workers.map(w => (w.apartmentId === id ? { ...w, apartmentId: null } : w)),
    }));
  }, [deleteRow]);

  // تسكين مجموعة عمال في شقة (أو نقلهم من شقة تانية) بطلب واحد. apartmentId = null يعني إخراجهم من السكن.
  const assignWorkersToApartment = useCallback(async (apartmentId, workerIds) => {
    if (!workerIds || workerIds.length === 0) return;
    const { data, error } = await supabase
      .from('workers')
      .update({ apartment_id: apartmentId || null })
      .in('id', workerIds)
      .select();
    if (error) { console.error('assign workers to apartment failed:', error); throw error; }
    const updated = fromDbList('workers', data);
    setState(prev => ({
      ...prev,
      workers: prev.workers.map(w => updated.find(u => u.id === w.id) || w),
    }));
  }, []);

  // ---------------- Derived totals (kept for API compatibility) ----------------
  const getTotalExpenses = useCallback((type = null) => {
    let total = 0;
    if (!type || type === 'cash') {
      total += state.advances.filter(a => a.paymentType === 'cash').reduce((s, a) => s + (a.amount || 0), 0);
      total += state.custody.filter(c => c.paymentType === 'cash').reduce((s, c) => s + (c.amount || 0), 0);
      total += state.foodExpenses.filter(f => f.paymentType === 'cash').reduce((s, f) => s + (f.totalAmount || 0), 0);
      total += state.purchases.filter(p => p.paymentType === 'cash').reduce((s, p) => s + (p.amount || 0), 0);
      total += state.transfers.filter(t => t.paymentType === 'cash').reduce((s, t) => s + (t.amount || 0), 0);
      total += state.payments.filter(p => p.paymentType === 'cash').reduce((s, p) => s + (p.amount || 0), 0);
    }
    if (!type || type === 'insta') {
      const isInsta = p => p.paymentType === 'insta' || p.paymentType === 'wallet';
      total += state.advances.filter(isInsta).reduce((s, a) => s + (a.amount || 0), 0);
      total += state.custody.filter(isInsta).reduce((s, c) => s + (c.amount || 0), 0);
      total += state.foodExpenses.filter(isInsta).reduce((s, f) => s + (f.totalAmount || 0), 0);
      total += state.purchases.filter(isInsta).reduce((s, p) => s + (p.amount || 0), 0);
      total += state.transfers.filter(isInsta).reduce((s, t) => s + (t.amount || 0), 0);
      total += state.payments.filter(isInsta).reduce((s, p) => s + (p.amount || 0), 0);
    }
    return total;
  }, [state]);

  const value = {
    ...state,
    auth,
    userRole,
    authLoading,
    dataLoading,
    dataError,
    login,
    logout,
    reloadData: loadAllData,
    addWorker,
    addWorkersBulk,
    updateWorker,
    deleteWorker,
    addAttendance,
    addAttendanceBulk,
    deleteAttendanceForDate,
    clearOvertimeForDate,
    addAdvance,
    upsertAdvance,
    deleteAdvance,
    deleteAdvancesForDate,
    addCustody,
    deleteCustody,
    addFoodExpense,
    deleteFoodExpense,
    addPurchase,
    deletePurchase,
    addTransfer,
    updateTransfer,
    deleteTransfer,
    addExternalTransfer,
    deleteExternalTransfer,
    addPillar,
    deletePillar,
    addBuilding,
    updateBuilding,
    deleteBuilding,
    addPlot,
    updatePlot,
    deletePlot,
    updateBudget,
    addPayment,
    deletePayment,
    setPayrollRange,
    getTotalExpenses,
    generateQRCode,
    scanQRAttendance,
    endQRAttendance,
    deleteQRCode,
    addContractor,
    deleteContractor,
    addContractorPayment,
    deleteContractorPayment,
    markContractorPaid,
    addApartment,
    updateApartment,
    deleteApartment,
    assignWorkersToApartment,
    setWeeklyBudget,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
