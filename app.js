const { useState, useEffect } = React;

// 🔐 بيانات الربط (مباشرة وآمنة عبر السياسات)
const SUPABASE_URL = "https://wiugwyhpuhokhocttwbq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zzDhn9DNIAdjJLn8aNzKzA_4IapbzcL";

// جلب عميل السوبابيز من المتصفح مباشرة لضمان عدم حدوث أخطاء موديلز
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ⏰ مواعيد الحجوزات بنظام 12 ساعة
const TIME_SLOTS = [
  "1:00 ظهراً", "2:00 ظهراً", "3:00 عصراً", "4:00 عصراً", 
  "5:00 مساءً", "6:00 مساءً", "7:00 مساءً", "8:00 مساءً", 
  "9:00 مساءً", "10:00 مساءً", "11:00 مساءً", "12:00 مساءً"
];

const FIELD_NAME = "استكانه أرينا";

function parseTo24Hour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
  try {
    const hour = parseInt(timeStr.split(":")[0]);
    if (!timeStr.includes("ظهراً") && !timeStr.includes("عصراً") && !timeStr.includes("مساءً")) return hour;
    if (timeStr.includes("ظهراً") || timeStr.includes("عصراً")) return hour + 12; 
    if (timeStr.includes("مساءً")) {
      if (hour === 12) return 24;
      return hour + 12;
    }
    return hour;
  } catch (e) { return 0; }
}

function getPriceForSlot(timeStr) {
  const hour24 = parseTo24Hour(timeStr);
  return hour24 >= 13 && hour24 <= 18 ? 100 : 150;
}

function calculateBookingPrice(startTime, duration) {
  const startIdx = TIME_SLOTS.indexOf(startTime);
  if (startIdx === -1) return 0;
  let total = 0;
  for (let i = 0; i < duration; i++) {
    const slotTime = TIME_SLOTS[startIdx + i];
    if (slotTime) total += getPriceForSlot(slotTime);
  }
  return total;
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function genId() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }
function openWA(phone, message) { window.open(`https://wa.me/2${phone}?text=${encodeURIComponent(message)}`, "_blank"); }

function buildConfirmMsg(b) {
  return `مرحباً ${b.name} 👋\n\n✅ *تم تأكيد حجزك في ${FIELD_NAME}* ⚽\n\n━━━━━━━━━━━━━━━━━━\n📅 التاريخ : ${formatDate(b.date)}\n⏰ الوقت   : ${b.time}\n⏱ المدة   : ${b.duration} ساعة\n💰 المبلغ  : ${b.price} جنيه\n━━━━━━━━━━━━━━━━━━\n\nبرجاء الحضور قبل الموعد بـ 10 دقائق 🙏\nنتمنى لك وقت ممتع! 🌟`;
}

function buildReminderMsg(b) {
  return `⏰ *تذكير بموعدك*\n\nمرحباً ${b.name}،\nلديك حجز في ${FIELD_NAME} ⚽\n\n📅 ${formatDate(b.date)}\n⏰ الساعة ${b.time} (${b.duration} ساعة)\n💰 المبلغ: ${b.price} جنيه\n\nفي انتظارك! 🎉`;
}

function App() {
  const [view, setView] = useState("booking");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [adminDate, setAdminDate] = useState(todayStr());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", duration: "1" });
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [adminTab, setAdminTab] = useState("pending");
  const [reportMonth, setReportMonth] = useState(todayStr().slice(0, 7));
  const [adminPass, setAdminPass] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(() => localStorage.getItem("estikana_admin_logged") === "true");
  const [passError, setPassError] = useState("");
  const [detailModal, setDetailModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    fetchBookings();
    const channels = supabaseClient.channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { fetchBookings(); })
      .subscribe();
    return () => { channels.unsubscribe(); };
  }, []);

  async function fetchBookings() {
    try {
      const { data, error } = await supabaseClient.from('bookings').select('*');
      if (!error && data) setBookings(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "admin") { setView("admin"); } 
    else { setView("booking"); }
  }, []);

  function isTimeInPast(timeStr, dateStr) {
    if (dateStr !== todayStr()) return false;
    const now = new Date();
    return parseTo24Hour(timeStr) <= now.getHours();
  }

  const dayBookings = bookings.filter(b => b.date === selectedDate && b.status !== "cancelled");
  const bookedSlots = new Set();
  dayBookings.forEach(b => {
    for (let i = 0; i < b.duration; i++) {
      const idx = TIME_SLOTS.indexOf(b.time);
      if (idx !== -1 && idx + i < TIME_SLOTS.length) bookedSlots.add(TIME_SLOTS[idx + i]);
    }
  });

  function isSlotAvailable(time, duration = 1) {
    const idx = TIME_SLOTS.indexOf(time);
    for (let i = 0; i < duration; i++) {
      if (idx + i >= TIME_SLOTS.length || bookedSlots.has(TIME_SLOTS[idx + i])) return false;
    }
    return true;
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 4000);
  }

  async function handleBook() {
    setFormError("");
    if (!form.name.trim()) { setFormError("من فضلك أدخل الاسم"); return; }
    if (!form.phone.match(/^01[0-9]{9}$/)) { setFormError("رقم الواتس اب غير صحيح"); return; }
    const dur = parseInt(form.duration);
    if (!isSlotAvailable(modal.time, dur)) { setFormError("الموعد غير متاح"); return; }

    const newBooking = {
      id: genId(), name: form.name.trim(), phone: form.phone.trim(),
      date: selectedDate, time: modal.time, duration: dur,
      price: calculateBookingPrice(modal.time, dur), status: "pending", paid: false
    };

    const { error } = await supabaseClient.from('bookings').insert([newBooking]);
    if (error) { showToast("حدث خطأ أثناء حفظ الحجز", "warn"); } 
    else {
      setModal(null); setForm({ name: "", phone: "", duration: "1" });
      showToast("✅ تم استلام طلب حجزك وحفظه أونلاين!");
      fetchBookings();
    }
  }

  async function doConfirm(b) {
    const { error } = await supabaseClient.from('bookings').update({ status: 'confirmed' }).eq('id', b.id);
    if (!error) {
      setConfirmModal(null);
      openWA(b.phone, buildConfirmMsg(b));
      showToast("✅ تم تأكيد الحجز وفتح الواتساب!");
      fetchBookings();
    }
  }

  async function cancelBooking(id) {
    if (!window.confirm("هل تريد إلغاء هذا الحجز؟")) return;
    const { error } = await supabaseClient.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    if (!error) { setDetailModal(null); showToast("🚫 تم إلغاء الحجز.", "warn"); fetchBookings(); }
  }

  async function togglePaid(id, currentPaid) {
    const { error } = await supabaseClient.from('bookings').update({ paid: !currentPaid }).eq('id', id);
    if (!error) {
      setDetailModal(prev => prev && prev.id === id ? { ...prev, paid: !currentPaid } : prev);
      showToast("💵 تم تحديث حالة الدفع");
      fetchBookings();
    }
  }

  async function handleAdminLogin() {
    if (!adminPass.trim()) return;
    setLoginLoading(true); setPassError("");
    try {
      const { data, error } = await supabaseClient.from('admin_config').select('value').eq('key', 'admin_password').single();
      if (!error && data && data.value === adminPass.trim()) {
        setAdminUnlocked(true);
        localStorage.setItem("estikana_admin_logged", "true");
      } else {
        setPassError("كلمة المرور غير صحيحة ❌");
      }
    } catch (e) { setPassError("حدث خطأ في الاتصال بالسيرفر"); }
    setLoginLoading(false);
  }

  const adminDayAll = bookings.filter(b => b.date === adminDate);
  const pendingList = adminDayAll.filter(b => b.status === "pending");
  const confirmedList = adminDayAll.filter(b => b.status === "confirmed");
  const cancelledList = adminDayAll.filter(b => b.status === "cancelled");
  const reportBookings = bookings.filter(b => b.date.startsWith(reportMonth));
  const totalRevenue = reportBookings.filter(b => b.paid).reduce((s, b) => s + b.price, 0);
  const pendingRevenue = reportBookings.filter(b => !b.paid && b.status !== "cancelled").reduce((s, b) => s + b.price, 0);

  function StatusBadge({ status }) {
    const map = {
      pending: { bg: "#78350f", color: "#fbbf24", label: "⏳ في الانتظار" },
      confirmed: { bg: "#14532d", color: "#4ade80", label: "✅ مؤكد" },
      cancelled: { bg: "#450a0a", color: "#f87171", label: "🚫 ملغي" },
    };
    const s = map[status] || map.pending;
    return <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{s.label}</span>;
  }

  function BookingCard({ b }) {
    return (
      <div style={S.bookingCard} onClick={() => setDetailModal(b)}>
        <div style={S.bookingTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={S.bookingId}>#{b.id}</span>
            <span style={S.bookingName}>{b.name}</span>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <div style={S.bookingMid}>
          <span>📱 {b.phone}</span>
          <span>⏰ {b.time} ({b.duration}س)</span>
          <span>💰 {b.price} ج</span>
          <span>{b.paid ? "💵 مدفوع" : "🔴 لم يُدفع"}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.contentWrapper}>
        <header style={S.header}>
          <div style={S.logo}>⚽ {FIELD_NAME}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{view === "admin" ? "🛠️ لوحة التحكم" : "👋 أهلاً بك"}</div>
        </header>

        {toast.msg && <div style={{ ...S.toast, background: toast.type === "warn" ? "#f59e0b" : "#22c55e" }}>{toast.msg}</div>}

        {loading ? (
          <div style={{ color: "#94a3b8", textAlign: "center", padding: "100px", fontSize: "18px", fontWeight: "bold" }}>🔄 جاري الاتصال...</div>
        ) : (
          view === "booking" ? (
            <div style={S.page}>
              <div style={S.hero}>
                <h1 style={S.heroTitle}>احجز ملعبك دلوقتي</h1>
                <p style={S.heroSub}>اختار اليوم والساعة المناسبة وابعت طلبك في ثواني</p>
              </div>
              <div style={S.card}>
                <label style={S.label}>📅 اختار يوم</label>
                <input type="date" value={selectedDate} min={todayStr()} onChange={e => setSelectedDate(e.target.value)} style={S.dateInput} />
              </div>
              <div style={S.legendRow}>
                <span style={S.chip("#4ade80", "#14532d")}>🟩 متاح للحجز</span>
                <span style={S.chip("#f87171", "#450a0a")}>🟥 محجوز أو مضى</span>
              </div>
              <div style={S.slotsGrid}>
                {TIME_SLOTS.map(time => {
                  const booked = bookedSlots.has(time);
                  const past = isTimeInPast(time, selectedDate);
                  const unavailable = booked || past;
                  return (
                    <div key={time} onClick={() => !unavailable && setModal({ time })} style={{ ...S.slot, ...(unavailable ? S.slotBooked : S.slotFree) }}>
                      <span style={S.slotTime}>{time}</span>
                      <span style={S.slotLabel}>{booked ? "محجوز" : past ? "انتهى" : `${getPriceForSlot(time)} جنيه`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={S.page}>
              {!adminUnlocked ? (
                <div style={S.loginCard}>
                  <h2 style={S.modalTitle}>دخول الإدارة الآمن</h2>
                  <input type="password" placeholder="كلمة المرور" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdminLogin()} style={S.input} />
                  {passError && <p style={S.errMsg}>{passError}</p>}
                  <button style={{ ...S.btnGreen, width: "100%", marginTop: 10 }} onClick={handleAdminLogin}>دخول</button>
                </div>
              ) : (
                <>
                  <div style={S.adminTop}>
                    <h2 style={S.adminTitle}>🏟️ لوحة إدارة {FIELD_NAME}</h2>
                    <div style={S.tabs}>
                      {[{ key: "pending", label: `⏳ انتظار (${pendingList.length})` }, { key: "confirmed", label: `✅ مؤكدة (${confirmedList.length})` }, { key: "report", label: "📊 التقارير" }].map(t => (
                        <button key={t.key} style={adminTab === t.key ? S.tabActive : S.tab} onClick={() => setAdminTab(t.key)}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  {adminTab === "pending" && pendingList.map(b => <BookingCard key={b.id} b={b} />)}
                  {adminTab === "confirmed" && confirmedList.map(b => <BookingCard key={b.id} b={b} />)}
                </>
              )}
            </div>
          )
        )}
      </div>

      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <h2 style={S.modalTitle}>📋 طلب حجز جديد</h2>
            <div style={S.formGroup}>
              <label style={S.label}>الاسم</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={S.input} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>رقم الواتساب</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={S.input} />
            </div>
            {formError && <p style={S.errMsg}>{formError}</p>}
            <div style={S.row}>
              <button style={S.btnGray} onClick={() => setModal(null)}>إلغاء</button>
              <button style={S.btnGreen} onClick={handleBook}>✅ إرسال</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  root: { minHeight: "100vh", background: "#0f172a", fontFamily: "Tahoma,sans-serif", direction: "rtl", color: "#f1f5f9", display: "flex", flexDirection: "column" },
  contentWrapper: { flex: 1 },
  header: { background: "#1e293b", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #22c55e" },
  logo: { fontSize: 22, fontWeight: 800, color: "#22c55e" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 28px", borderRadius: 10, zIndex: 999 },
  page: { maxWidth: 820, margin: "0 auto", padding: "24px 16px" },
  hero: { textAlign: "center", padding: "20px 0" },
  heroTitle: { fontSize: 28, fontWeight: 800, color: "#22c55e" },
  heroSub: { color: "#94a3b8", marginTop: 8 },
  card: { background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { display: "block", color: "#94a3b8", marginBottom: 6 },
  dateInput: { background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9", padding: "10px", borderRadius: 8, width: "100%" },
  legendRow: { display: "flex", gap: 12, marginBottom: 16 },
  chip: (color, bg) => ({ background: bg, color: color, borderRadius: 20, padding: "4px 14px", fontSize: 13 }),
  slotsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 },
  slot: { padding: "12px 8px", borderRadius: 10, textAlign: "center", cursor: "pointer" },
  slotFree: { background: "#14532d", border: "1px solid #22c55e", color: "#4ade80" },
  slotBooked: { background: "#2d1a1a", border: "1px solid #ef4444", color: "#f87171", cursor: "not-allowed" },
  slotTime: { display: "block", fontWeight: 700 },
  slotLabel: { display: "block", fontSize: 11 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modalCard: { background: "#1e293b", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 },
  modalTitle: { color: "#22c55e", fontSize: 20, marginBottom: 12 },
  formGroup: { marginBottom: 14 },
  input: { background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9", padding: "10px", borderRadius: 8, width: "100%" },
  errMsg: { color: "#f87171", fontSize: 13 },
  row: { display: "flex", gap: 12, justifyContent: "flex-end" },
  btnGreen: { background: "#22c55e", color: "#0f172a", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 700, cursor: "pointer" },
  btnGray: { background: "#334155", color: "#f1f5f9", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer" },
  bookingCard: { background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #334155" },
  bookingTop: { display: "flex", justifyContent: "space-between" },
  bookingId: { color: "#22c55e", fontWeight: 700 },
  bookingMid: { display: "flex", gap: 16, color: "#94a3b8", fontSize: 13, marginTop: 8 },
  adminTop: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  tabs: { display: "flex", gap: 8 },
  tab: { background: "#1e293b", color: "#94a3b8", border: "none", padding: "6px 12px", borderRadius: 6 },
  tabActive: { background: "#22c55e", color: "#0f172a", fontWeight: 700, padding: "6px 12px", borderRadius: 6 }
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
