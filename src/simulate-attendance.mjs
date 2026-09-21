let attendance = [];
let selectedDate = '2026-08-02';
let localState = {};
let saveTimer = null;
const workers = [
  { id: 'w1', name: 'A', code: 'W0001', role: 'حداد', dailyWage: 200, status: 'active' },
  { id: 'w2', name: 'B', code: 'W0002', role: 'حداد', dailyWage: 200, status: 'active' },
];
const activeWorkers = workers;

function getRecord(workerId) {
  const key = `${selectedDate}:${workerId}`;
  const saved = attendance.find(a => a.workerId === workerId && a.date === selectedDate);
  const local = localState[key];
  if (local !== undefined) return local;
  if (saved) {
    return {
      status: saved.status,
      overtimeFraction: saved.overtimeFraction || '',
      overtimeValue: saved.overtimeValue || 0,
      pillarCost: saved.pillarCost || 0,
    };
  }
  return { status: 'absent', overtimeFraction: '', overtimeValue: 0, pillarCost: 0 };
}

function setRecord(workerId, field, value) {
  const key = `${selectedDate}:${workerId}`;
  const current = localState[key] || getRecord(workerId);
  localState = { ...localState, [key]: { ...current, [field]: value } };
}

function addAttendanceBulk(records) {
  for (const record of records) {
    const existing = attendance.findIndex(
      a => a.workerId === record.workerId && a.date === record.date
    );
    if (existing >= 0) {
      attendance[existing] = { ...attendance[existing], ...record };
    } else {
      attendance.push({ ...record, id: 'id_' + Math.random() });
    }
  }
}

function saveAttendance() {
  const prefix = `${selectedDate}:`;
  const hasChanges = Object.keys(localState).some(k => k.startsWith(prefix));
  if (!hasChanges) return false;
  const records = [];
  activeWorkers.forEach(w => {
    if (localState[`${prefix}${w.id}`] !== undefined) {
      const rec = getRecord(w.id);
      records.push({
        workerId: w.id,
        workerName: w.name,
        workerCode: w.code,
        date: selectedDate,
        status: rec.status,
        overtimeFraction: rec.overtimeFraction || '',
        overtimeValue: rec.overtimeValue || 0,
        pillarCost: rec.pillarCost || 0,
        role: w.role,
      });
    }
  });
  if (records.length > 0) {
    addAttendanceBulk(records);
    const next = { ...localState };
    Object.keys(next).forEach(k => { if (k.startsWith(prefix)) delete next[k]; });
    localState = next;
    return true;
  }
  return false;
}

// Simulate the React effect cycle:
// onChange date -> render -> effect cleanup (clearTimeout) -> effect setup -> reset effect
function changeDate(newDate) {
  selectedDate = newDate;
  // effect cleanup for auto-save (React runs cleanup before re-running)
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  // auto-save effect re-runs (only schedules if localState non-empty)
  if (Object.keys(localState).length > 0) {
    const snapshot = { localState, selectedDate };
    saveTimer = setTimeout(() => {
      // The timer closure calls the saveAttendance from THIS render
      const prev = { localState: snapshot.localState, selectedDate: snapshot.selectedDate };
      // saveAttendance uses the selectedDate captured in its closure (the render's selectedDate)
      selectedDate = snapshot.selectedDate;
      localState = snapshot.localState;
      saveAttendance();
    }, 500);
  }
  // reset effect runs: clear localState
  localState = {};
}

console.log('=== Scenario: enter data on day 2, then navigate to day 3 ===');
console.log('1) User enters overtime on day 2 for w1');
setRecord('w1', 'status', 'present');
setRecord('w1', 'overtimeFraction', '0.5');
setRecord('w1', 'overtimeValue', 100);
console.log('   localState:', JSON.stringify(localState));

console.log('2) User immediately navigates to day 3 (before 500ms auto-save)');
changeDate('2026-08-03');
console.log('   localState after date change:', JSON.stringify(localState));

console.log('3) Fire pending auto-save timer (if any)');
if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
// force run in case timer still pending (worst case)
const wasSaved = (() => {
  // worst-case: the pending timer from the PREVIOUS render fires with day-2 closure
  return false;
})();
console.log('   attendance after:', JSON.stringify(attendance.map(a => ({ d: a.date, w: a.workerId, ot: a.overtimeValue, st: a.status }))));

console.log('4) What would day 3 show?');
const day3Records = attendance.filter(a => a.date === '2026-08-03');
console.log('   day-3 records:', day3Records.length);

console.log('\n=== Scenario B: user enters day-2 data, waits for auto-save, THEN navigates to day 3 ===');
attendance = []; localState = {}; selectedDate = '2026-08-02';
setRecord('w1', 'status', 'present');
setRecord('w1', 'overtimeValue', 100);
saveAttendance();
console.log('   after auto-save, attendance:', JSON.stringify(attendance.map(a => ({ d: a.date, w: a.workerId, ot: a.overtimeValue, st: a.status }))));
selectedDate = '2026-08-03';
localState = {};
const day3b = attendance.filter(a => a.date === '2026-08-03');
console.log('   day-3 records:', day3b.length);
