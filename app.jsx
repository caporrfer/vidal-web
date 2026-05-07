const { useState, useEffect, useMemo, useRef } = React;

/* ---------- constants ---------- */
const SERVICES = [
  { id:"corte",   n:"01", name:"Corte Clásico",   desc:"Corte con tijera y máquina. Acabado a medida.", price:12, dur:30 },
  { id:"fade",    n:"02", name:"Fade Premium",    desc:"Degradado de precisión, contorno y styling.",   price:20, dur:45 },
  { id:"barba",   n:"03", name:"Barba & Perfilado",desc:"Ritual de afeitado con toallas calientes.",    price:12, dur:30 },
  { id:"combo",   n:"04", name:"Corte + Barba",   desc:"La experiencia completa Vidal. Lo recomendado.",price:28, dur:60 }
];

const MONTH_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DOW_ES = ["L","M","X","J","V","S","D"];
const DOW_LONG = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const ALL_SLOTS = {
  morning: ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00"],
  afternoon:["15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"]
};

/* ---------- helpers ---------- */
function pad(n){return String(n).padStart(2,"0")}
function keyDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function prettyDate(d){return `${DOW_LONG[(d.getDay()+6)%7]} ${d.getDate()} ${MONTH_ES[d.getMonth()]}`}
function sameDay(a,b){return a.getFullYear()==b.getFullYear()&&a.getMonth()==b.getMonth()&&a.getDate()==b.getDate()}

/* seed admin data so the panel looks real */
const seedAppointments = () => {
  const today = new Date();
  const d = (offset, hh, mm) => {
    const x = new Date(today); x.setDate(today.getDate()+offset); x.setHours(hh,mm,0,0); return x;
  };
  return [
    { id:"v-801", name:"Carlos Méndez",  email:"carlos.m@mail.com",   phone:"+34 612 445 901", service:"combo", date:keyDate(d(0,10,0)),  time:"10:00", status:"upcoming", created:Date.now()-3600e3*6 },
    { id:"v-802", name:"Marco Ferrari",  email:"marco@studio.es",     phone:"+34 697 221 004", service:"fade",  date:keyDate(d(0,12,30)), time:"12:30", status:"upcoming", created:Date.now()-3600e3*4 },
    { id:"v-803", name:"Iván Soto",      email:"ivan.s@gmail.com",    phone:"+34 654 112 886", service:"corte", date:keyDate(d(0,16,0)),  time:"16:00", status:"upcoming", created:Date.now()-3600e3*2 },
    { id:"v-804", name:"Daniel Ríos",    email:"drios@outlook.com",   phone:"+34 611 774 330", service:"barba", date:keyDate(d(1,9,30)),  time:"09:30", status:"upcoming", created:Date.now()-3600e3*12 },
    { id:"v-805", name:"Luis Ortega",    email:"luis.o@mail.com",     phone:"+34 622 991 745", service:"combo", date:keyDate(d(1,17,0)),  time:"17:00", status:"upcoming", created:Date.now()-3600e3*18 },
    { id:"v-806", name:"Andrés Gil",     email:"agil@mail.com",       phone:"+34 633 554 220", service:"fade",  date:keyDate(d(2,11,0)),  time:"11:00", status:"upcoming", created:Date.now()-3600e3*24 },
    { id:"v-807", name:"Julián Vega",    email:"jvega@mail.com",      phone:"+34 644 776 112", service:"corte", date:keyDate(d(-1,18,0)), time:"18:00", status:"done",     created:Date.now()-86400e3 },
    { id:"v-808", name:"Pedro Castro",   email:"pcastro@mail.com",    phone:"+34 688 113 009", service:"combo", date:keyDate(d(-1,12,0)), time:"12:00", status:"done",     created:Date.now()-86400e3 }
  ];
};

/* ---------- storage ---------- */
const STORAGE = "vb_appts_v1";
const loadAppts = () => {
  try { const x = localStorage.getItem(STORAGE); if(x) return JSON.parse(x); } catch(e){}
  const s = seedAppointments(); localStorage.setItem(STORAGE, JSON.stringify(s)); return s;
};
const saveAppts = (a) => localStorage.setItem(STORAGE, JSON.stringify(a));

/* ---------- icons ---------- */
const I = {
  arrow: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  chev:  (d="R")=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{transform:d=="L"?"rotate(180deg)":""}}><path d="M9 6l6 6-6 6"/></svg>,
  close: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  check: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg>,
  trash: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></svg>,
  phone: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.7.6 2.5a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.8.3 1.6.5 2.5.6a2 2 0 011.7 2z"/></svg>,
  mail:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M22 7l-10 7L2 7"/></svg>,
  hamb:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h18M3 17h18"/></svg>,
  cal:   ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  list:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M4 12h16M4 17h10"/></svg>,
  wa:    ()=><svg viewBox="0 0 32 32"><path d="M16 3A13 13 0 003 16a12.9 12.9 0 001.9 6.8L3 29l6.4-1.7A13 13 0 1016 3zm7.5 18.3c-.3.9-1.8 1.8-2.5 1.9-.6.1-1.4.1-2.3-.2a20 20 0 01-2.1-.8 16.2 16.2 0 01-6.4-5.7c-.5-.7-1.3-2-1.3-3.8 0-1.8 1-2.7 1.3-3 .3-.4.7-.4 1-.4h.7c.2 0 .5-.1.8.6l1.1 2.7c.1.2.2.5 0 .7l-.4.6c-.2.2-.4.4-.2.8a12 12 0 002.2 2.7 10.8 10.8 0 003.2 2c.4.2.6.1.8-.1l1-1.1c.2-.3.5-.2.8-.1l2.6 1.2c.3.2.5.3.6.4.1.2.1 1-.1 1.8z"/></svg>
};

/* ============================================================ */
/*  CLIENT SITE                                                 */
/* ============================================================ */

function ClientSite({ appts, setAppts, onGoAdmin, tweaks }) {
  const [selSvc, setSelSvc] = useState("combo");
  const [mobOpen, setMobOpen] = useState(false);
  const [success, setSuccess] = useState(null);
  const bookRef = useRef(null);

  const scrollTo = (id) => {
    setMobOpen(false);
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop - 60, behavior:"smooth" });
  };

  return (
    <div className="app">
      {/* NAV */}
      <div className="nav">
        <div className="nav-inner">
          <div className="brand">
            <img src="assets/logo.png" alt="" style={{width:34,height:34,objectFit:"contain",filter:"invert(1) contrast(1.1)"}} />
            <span className="brand-name">Vidal Barber</span>
          </div>
          <div className="nav-links">
            <button onClick={()=>scrollTo("services")}>Servicios</button>
            <button onClick={()=>scrollTo("booking")}>Reservar</button>
            <button onClick={()=>scrollTo("gallery")}>Trabajos</button>
            <button onClick={()=>scrollTo("about")}>Estudio</button>
            <button onClick={onGoAdmin} style={{color:"var(--muted)"}}>Admin</button>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button className="hamb" onClick={()=>setMobOpen(true)}><I.hamb/></button>
            <button className="nav-cta" onClick={()=>scrollTo("booking")}>Reservar<I.arrow/></button>
          </div>
        </div>
      </div>

      {mobOpen && (
        <div className="mobmenu">
          <div className="top">
            <span className="brand-name">Vidal Barber</span>
            <button className="hamb" onClick={()=>setMobOpen(false)}><I.close/></button>
          </div>
          <nav>
            <button onClick={()=>scrollTo("services")}>Servicios</button>
            <button onClick={()=>scrollTo("booking")}>Reservar cita</button>
            <button onClick={()=>scrollTo("gallery")}>Trabajos</button>
            <button onClick={()=>scrollTo("about")}>El estudio</button>
            <button onClick={onGoAdmin} style={{fontSize:18,color:"var(--muted)",fontFamily:"'JetBrains Mono',monospace",letterSpacing:".2em",textTransform:"uppercase",borderBottom:0,paddingTop:28}}>→ Acceso peluquero</button>
          </nav>
        </div>
      )}

      {/* HERO */}
      <section className="hero">
        <div className="hero-side">Est. 2019 · Huelva · Walk-ins & bookings</div>
        <div className="hero-copy">
          <div>
            <div className="hero-eyebrow"><span className="dot"></span>Abierto hoy · 10:00 — 14:00 · 16:00 — 20:30</div>
            <h1 className="hero-title">Hecho a <em>mano</em>,<br/>pensado <span className="hero-slash"></span>para ti</h1>
            <p className="hero-tag">Una barbería de autor en el corazón de Huelva. Cortes de precisión, barba clásica y una experiencia tranquila donde todo se cuida — desde la primera toalla caliente hasta el último detalle del contorno.</p>
            <div className="hero-actions">
              <button className="btn-primary" onClick={()=>scrollTo("booking")}>Reservar cita<I.arrow/></button>
              <button className="btn-ghost" onClick={()=>scrollTo("services")}>Ver servicios</button>
            </div>
          </div>
          <div className="hero-meta">
            <div><div className="k">07 <span style={{fontSize:14,color:"var(--muted)"}}>años</span></div><div className="l">Afilando el oficio</div></div>
            <div><div className="k">4.9 <span style={{fontSize:14,color:"var(--muted)"}}>★</span></div><div className="l">480+ reseñas</div></div>
            <div><div className="k">30′</div><div className="l">Duración media</div></div>
          </div>
        </div>
        <div className="hero-visual">
          <img src="assets/shop.jpg" alt="Estudio Vidal Barber" />
          <div className="hero-tape"><span className="live"></span>En directo · silla libre en 25′</div>
          <div className="hero-caption">
            <span>Nº 001 — El estudio</span>
            <span>C. Dulce Nombre de María · 5</span>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="divider-ticker">
        <div className="ticker-track">
          {[...Array(2)].map((_,i)=>(
            <React.Fragment key={i}>
              <span>Precisión</span><span>Oficio</span><span>Hombre moderno</span>
              <span>Toalla caliente</span><span>Navaja</span><span>Estilo propio</span>
              <span>Sin prisas</span><span>Sin prisas</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* SERVICES */}
      <section id="services" className="block">
        <div className="block-head">
          <div>
            <div className="block-num">— 01 / Servicios</div>
            <h2 className="block-title">Elige tu <em>ritual</em></h2>
          </div>
          <div className="block-sub" style={{maxWidth:320,textTransform:"none",letterSpacing:"normal",fontSize:14}}>
            Selecciona un servicio para pre-llenar tu reserva. Los tiempos y precios incluyen styling.
          </div>
        </div>
        <div className="services">
          {SERVICES.map(s=>(
            <div key={s.id} className={"svc"+(selSvc===s.id?" selected":"")} onClick={()=>setSelSvc(s.id)}>
              <div>
                <div className="n">{s.n}</div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="row">
                <span className="price">{s.price}€</span>
                <span className="dur">{s.dur} MIN</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOOKING */}
      <section id="booking" className="block" style={{paddingTop:0}} ref={bookRef}>
        <div className="block-head">
          <div>
            <div className="block-num">— 02 / Agenda</div>
            <h2 className="block-title">Reserva en <em>tres pasos</em></h2>
          </div>
          <div className="block-sub">Fecha · Hora · Datos</div>
        </div>
        <Booking
          service={SERVICES.find(s=>s.id===selSvc)}
          appts={appts}
          onConfirm={(appt)=>{
            const next=[...appts, appt]; setAppts(next); saveAppts(next);
            setSuccess(appt);
          }}
        />
      </section>

      {/* GALLERY */}
      <section id="gallery" className="block">
        <div className="block-head">
          <div>
            <div className="block-num">— 03 / Trabajos</div>
            <h2 className="block-title">Trabajos <em>recientes</em></h2>
          </div>
          <div className="block-sub">Instagram · @vidal.barber</div>
        </div>
        <div className="gallery">
          <div className="g-item g-1"><img src="assets/cut-1.jpg" alt=""/><span className="tag">001 — Platinum Fade</span></div>
          <div className="g-item g-2"><img src="assets/shop.jpg" alt=""/><span className="tag">002 — El estudio</span></div>
          <div className="g-item g-3"><img src="assets/cut-2.jpg" alt=""/><span className="tag">003 — Fringe texture</span></div>
          <div className="g-item g-4"><img src="assets/cut-3.jpg" alt=""/><span className="tag">004 — Barba clásica</span></div>
          <div className="g-item g-5"><img src="assets/cut-1.jpg" alt=""/><span className="tag">005 — Skin fade</span></div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="block">
        <div className="block-head">
          <div>
            <div className="block-num">— 04 / Estudio</div>
            <h2 className="block-title">El <em>estudio</em></h2>
          </div>
        </div>
        <div className="about">
          <div className="about-text">
            <p>Vidal Barber nace de la obsesión por el oficio y la calma. Un espacio pequeño, reservado, donde cada cita se vive sin prisa.</p>
            <p>Trabajamos con navaja, tijera y máquina — pero, sobre todo, con atención. Nos tomamos el tiempo de entender el cabello, la cara y el día a día de cada cliente para proponer un corte que funcione durante semanas.</p>
          </div>
          <div className="about-list">
            <div className="row"><span className="k">Martes — Viernes</span><span className="v">10:00 — 14:00 · 16:00 — 20:30</span><span className="s open">Abierto</span></div>
            <div className="row"><span className="k">Sábado</span><span className="v">10:00 — 14:00</span><span className="s open">Abierto</span></div>
            <div className="row"><span className="k">Domingo · Lunes</span><span className="v">Cerrado</span><span className="s">—</span></div>
            <div className="row"><span className="k">Dirección</span><span className="v">C. Dulce Nombre de María, 5</span><span className="s">21002 Huelva</span></div>
            <div className="row"><span className="k">Teléfono</span><span className="v">642 13 47 30</span><span className="s">WhatsApp</span></div>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-brand">V — B</div>
        <div>© 2026 Vidal Barber · Todos los derechos reservados</div>
        <div style={{display:"flex",gap:18}}>
          <a>Instagram</a><a>Google Maps</a><a onClick={onGoAdmin} style={{cursor:"pointer"}}>Acceso peluquero</a>
        </div>
      </footer>

      {tweaks.showWhatsapp && (
        <a className="wa" title="WhatsApp" href="#" onClick={e=>{e.preventDefault();alert("Se abriría WhatsApp en +34 930 142 087")}}>
          <I.wa/>
        </a>
      )}

      {success && <SuccessOverlay appt={success} onClose={()=>setSuccess(null)} />}
    </div>
  );
}

/* ---------- booking widget ---------- */
function Booking({ service, appts, onConfirm }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDate, setSelDate] = useState(null);
  const [selTime, setSelTime] = useState(null);
  const [form, setForm] = useState({name:"",email:"",phone:""});
  const [errs, setErrs] = useState({});

  const takenForDate = useMemo(()=>{
    if(!selDate) return new Set();
    const k = keyDate(selDate);
    return new Set(appts.filter(a=>a.date===k && a.status!=="cancelled").map(a=>a.time));
  },[selDate,appts]);

  // Build days grid, monday-start
  const days = useMemo(()=>{
    const y=cursor.getFullYear(), m=cursor.getMonth();
    const first=new Date(y,m,1);
    const startOffset=(first.getDay()+6)%7; // Mon=0
    const daysInMonth=new Date(y,m+1,0).getDate();
    const prevDays=new Date(y,m,0).getDate();
    const cells=[];
    for(let i=0;i<startOffset;i++) cells.push({d:new Date(y,m-1,prevDays-startOffset+1+i), other:true});
    for(let i=1;i<=daysInMonth;i++) cells.push({d:new Date(y,m,i), other:false});
    while(cells.length%7) { const last=cells[cells.length-1].d; const nd=new Date(last); nd.setDate(nd.getDate()+1); cells.push({d:nd, other:true}); }
    while(cells.length<42) { const last=cells[cells.length-1].d; const nd=new Date(last); nd.setDate(nd.getDate()+1); cells.push({d:nd, other:true}); }
    return cells;
  },[cursor]);

  const dayStatus = (d) => {
    if(d < today) return "past";
    if(d.getDay()===0) return "closed"; // sunday
    // fake 'full' days for visual richness
    const k = keyDate(d);
    const bookings = appts.filter(a=>a.date===k).length;
    if(bookings>=8) return "full";
    return "open";
  };

  const slotIsTaken = (t) => takenForDate.has(t);
  const slotIsPast = (t) => {
    if(!selDate) return false;
    if(!sameDay(selDate, new Date())) return false;
    const [h,m]=t.split(":").map(Number);
    const now=new Date();
    return (h<now.getHours() || (h===now.getHours() && m<=now.getMinutes()));
  };

  const validate = () => {
    const e={};
    if(form.name.trim().length<2) e.name="Introduce tu nombre";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email="Email no válido";
    if(form.phone.replace(/\D/g,"").length<7) e.phone="Teléfono no válido";
    if(!selDate) e.date="Selecciona fecha";
    if(!selTime) e.time="Selecciona hora";
    return e;
  };
  const canConfirm = selDate && selTime && form.name && form.email && form.phone;

  const submit = () => {
    const e=validate(); setErrs(e);
    if(Object.keys(e).length) return;
    const appt = {
      id: "v-"+Math.random().toString(36).slice(2,7),
      name: form.name, email: form.email, phone: form.phone,
      service: service.id,
      date: keyDate(selDate), time: selTime,
      status: "upcoming", created: Date.now()
    };
    onConfirm(appt);
    // reset
    setSelTime(null); setForm({name:"",email:"",phone:""});
  };

  return (
    <div>
      <div className="booking">
        {/* CAL */}
        <div className="col">
          <div className="cal-head">
            <div className="cal-title">{MONTH_ES[cursor.getMonth()]} <span style={{color:"var(--muted)",fontStyle:"italic"}}>{cursor.getFullYear()}</span></div>
            <div className="cal-nav">
              <button onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))} aria-label="Mes anterior">{I.chev("L")}</button>
              <button onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))} aria-label="Mes siguiente">{I.chev("R")}</button>
            </div>
          </div>
          <div className="cal-grid">
            {DOW_ES.map(d=><div key={d} className="cal-dow">{d}</div>)}
            {days.map((c,i)=>{
              const st = dayStatus(c.d);
              const isSel = selDate && sameDay(selDate, c.d);
              const isToday = sameDay(c.d, new Date());
              const cls = ["cal-day"];
              if(c.other) cls.push("other");
              if(st==="past") cls.push("past");
              if(st==="closed") cls.push("closed");
              if(st==="full") cls.push("full");
              if(isToday) cls.push("today");
              if(isSel) cls.push("selected");
              return (
                <div key={i} className={cls.join(" ")} onClick={()=>{ if(!c.other && st!=="past" && st!=="closed"){ setSelDate(new Date(c.d)); setSelTime(null); }}}>
                  <span className="num">{c.d.getDate()}</span>
                  {isToday && <span className="d">HOY</span>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:16,display:"flex",gap:14,fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"var(--muted)",flexWrap:"wrap"}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:8,height:8,borderRadius:"50%",background:"var(--accent-2)"}}></i>Ocupación alta</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:8,height:8,display:"inline-block",border:"1px solid var(--accent-2)"}}></i>Hoy</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:8,height:8,display:"inline-block",background:"var(--cream)"}}></i>Seleccionado</span>
          </div>
        </div>

        {/* SLOTS */}
        <div className="col">
          <div className="slots-head">
            <div className="slots-title">Horas</div>
            <div className="slots-date">{selDate ? prettyDate(selDate) : "— selecciona fecha"}</div>
          </div>
          <div className="slots-legend">
            <span><i className="ok"/>Libre</span>
            <span><i className="bad"/>Ocupada</span>
            <span><i className="sel"/>Seleccionada</span>
          </div>

          {!selDate ? (
            <div className="slot-empty">Elige un día en el calendario para ver las horas disponibles.</div>
          ) : (
            <>
              <div className="period">— Mañana</div>
              <div className="slot-grid">
                {ALL_SLOTS.morning.map(t=>{
                  const taken=slotIsTaken(t), past=slotIsPast(t);
                  return (
                    <button key={t}
                      className={"slot"+(taken?" taken":"")+(past?" disabled":"")+(selTime===t?" selected":"")}
                      disabled={taken||past}
                      onClick={()=>setSelTime(t)}>{t}</button>
                  );
                })}
              </div>
              <div className="period">— Tarde</div>
              <div className="slot-grid">
                {ALL_SLOTS.afternoon.map(t=>{
                  const taken=slotIsTaken(t), past=slotIsPast(t);
                  return (
                    <button key={t}
                      className={"slot"+(taken?" taken":"")+(past?" disabled":"")+(selTime===t?" selected":"")}
                      disabled={taken||past}
                      onClick={()=>setSelTime(t)}>{t}</button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* FORM */}
      <div className="form">
        <div className="f">
          <label>Nombre completo</label>
          <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej. Andrés Soler"/>
          {errs.name && <div className="err">{errs.name}</div>}
        </div>
        <div className="f">
          <label>Email</label>
          <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="tu@email.com"/>
          {errs.email && <div className="err">{errs.email}</div>}
        </div>
        <div className="f">
          <label>Teléfono</label>
          <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+34 600 000 000"/>
          {errs.phone && <div className="err">{errs.phone}</div>}
        </div>
        <div className="f">
          <label>Servicio seleccionado</label>
          <input readOnly value={`${service.name} · ${service.price}€ · ${service.dur} min`}/>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="summary">
        <div>
          <div className="k">Resumen de la cita</div>
          <div className={"v"+(!selDate?" dim":"")}>{selDate ? prettyDate(selDate) : "Elige una fecha"}</div>
        </div>
        <div>
          <div className="k">Hora</div>
          <div className={"v"+(!selTime?" dim":"")}>{selTime || "—"}</div>
        </div>
        <button className="confirm-btn" disabled={!canConfirm} onClick={submit}>
          Confirmar reserva<I.arrow/>
        </button>
      </div>
    </div>
  );
}

/* ---------- success overlay ---------- */
function SuccessOverlay({ appt, onClose }) {
  const svc = SERVICES.find(s=>s.id===appt.service);
  const d = new Date(appt.date + "T" + appt.time);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="success" onClick={e=>e.stopPropagation()}>
        <button className="close" onClick={onClose}><I.close/></button>
        <div className="check"></div>
        <h3>Cita confirmada</h3>
        <p>Gracias <strong style={{color:"var(--cream)"}}>{appt.name.split(" ")[0]}</strong>. Te esperamos el <br/><em style={{fontFamily:"'Bodoni Moda',serif"}}>{prettyDate(d)} a las {appt.time}</em><br/>para tu <strong style={{color:"var(--cream)"}}>{svc.name}</strong>. Recibirás un recordatorio por email y WhatsApp.</p>
        <div className="actions">
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={onClose}>Añadir al calendario<I.arrow/></button>
        </div>
        <div className="ref">Ref · {appt.id.toUpperCase()} — Vidal Barber</div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  ADMIN                                                        */
/* ============================================================ */

function Admin({ appts, setAppts, onExit }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("vb_auth")==="1");
  const [tab, setTab] = useState("list");
  const [filter, setFilter] = useState("today");

  const today = keyDate(new Date());
  const tomorrow = (()=>{ const t=new Date(); t.setDate(t.getDate()+1); return keyDate(t); })();

  const filtered = useMemo(()=>{
    let list=[...appts].sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
    if(filter==="today") list=list.filter(a=>a.date===today);
    if(filter==="tomorrow") list=list.filter(a=>a.date===tomorrow);
    if(filter==="upcoming") list=list.filter(a=>a.status==="upcoming" && a.date>=today);
    if(filter==="done") list=list.filter(a=>a.status==="done");
    return list;
  },[appts, filter, today, tomorrow]);

  const stats = useMemo(()=>{
    const todayList = appts.filter(a=>a.date===today);
    const upcoming = appts.filter(a=>a.status==="upcoming" && a.date>=today);
    const revenue = todayList.reduce((s,a)=>{
      const svc=SERVICES.find(s=>s.id===a.service); return s+(svc?svc.price:0);
    },0);
    return { hoy: todayList.length, prox: upcoming.length, euros: revenue };
  },[appts, today]);

  const markDone = (id) => {
    const next = appts.map(a=>a.id===id?{...a,status:"done"}:a);
    setAppts(next); saveAppts(next);
  };
  const del = (id) => {
    if(!confirm("¿Eliminar esta cita?")) return;
    const next = appts.filter(a=>a.id!==id);
    setAppts(next); saveAppts(next);
  };

  if(!authed) {
    return (
      <div className="gate">
        <div className="gate-card">
          <h3>Zona privada</h3>
          <p>Acceso exclusivo para el equipo de Vidal Barber.</p>
          <input id="pwd" type="password" placeholder="Contraseña" onKeyDown={e=>{
            if(e.key==="Enter"){
              if(e.target.value==="vidal" || e.target.value==="admin"){ sessionStorage.setItem("vb_auth","1"); setAuthed(true); }
              else alert("Contraseña incorrecta");
            }
          }}/>
          <button onClick={()=>{
            const v = document.getElementById("pwd").value;
            if(v==="vidal" || v==="admin"){ sessionStorage.setItem("vb_auth","1"); setAuthed(true); }
            else alert("Contraseña incorrecta");
          }}>Entrar</button>
          <div className="hint">Demo · contraseña: <span style={{color:"var(--cream)"}}>vidal</span></div>
          <div style={{marginTop:18,textAlign:"center"}}>
            <button onClick={onExit} style={{fontSize:11,color:"var(--muted)",letterSpacing:".15em",textTransform:"uppercase"}}>← Volver al sitio</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="admin-top">
        <div className="admin-title">
          <div className="brand">
            <img src="assets/logo.png" alt="" style={{width:28,height:28,objectFit:"contain",filter:"invert(1)"}}/>
            <span className="brand-name" style={{fontSize:12}}>Vidal Barber</span>
          </div>
          <span className="tag">Panel interno</span>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted)",letterSpacing:".15em",textTransform:"uppercase"}}>Sesión · Vidal</span>
          <button className="btn-ghost" onClick={onExit}>Salir al sitio</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={"admin-tab"+(tab==="list"?" active":"")} onClick={()=>setTab("list")}>Lista</button>
        <button className={"admin-tab"+(tab==="cal"?" active":"")} onClick={()=>setTab("cal")}>Calendario</button>
      </div>

      <div className="admin-body">
        <div className="stat-stack">
          <div className="stat"><div className="k">Hoy</div><div className="v">{stats.hoy}</div><div className="d">Citas programadas</div></div>
          <div className="stat"><div className="k">Próximas</div><div className="v">{stats.prox}</div><div className="d">7 días</div></div>
          <div className="stat"><div className="k">Caja hoy</div><div className="v">{stats.euros}€</div><div className="d">Estimado</div></div>
        </div>

        {tab==="list" ? (
          <div className="appts">
            <div className="appts-head">
              <h3>Citas</h3>
              <div className="filters">
                {[["today","Hoy"],["tomorrow","Mañana"],["upcoming","Próximas"],["done","Completadas"],["all","Todas"]].map(([k,l])=>(
                  <button key={k} className={filter===k?"on":""} onClick={()=>setFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            {filtered.length===0 ? (
              <div className="empty">No hay citas en esta vista.</div>
            ) : filtered.map(a=>{
              const svc = SERVICES.find(s=>s.id===a.service);
              const d = new Date(a.date+"T"+a.time);
              return (
                <div key={a.id} className={"appt"+(a.status==="done"?" done":"")}>
                  <div className="when">
                    <div className="d">{pad(d.getDate())}</div>
                    <div className="t">{MONTH_ES[d.getMonth()].slice(0,3).toUpperCase()} · {a.time}</div>
                  </div>
                  <div className="who">
                    <div className="n">{a.name}</div>
                    <div className="svc">{svc?.name} · {svc?.dur}min · {svc?.price}€</div>
                  </div>
                  <div className="contact"><div>{a.phone}</div><div style={{color:"var(--muted)",marginTop:3}}>{a.email}</div></div>
                  <div className={"status "+(a.status==="upcoming"?"up":"dn")}>
                    {a.status==="upcoming"?"Programada":"Completada"}
                  </div>
                  <div className="actions">
                    {a.status==="upcoming" && <button title="Marcar completada" onClick={()=>markDone(a.id)}><I.check/></button>}
                    <button title="Llamar" onClick={()=>alert("Llamar a "+a.phone)}><I.phone/></button>
                    <button className="del" title="Eliminar" onClick={()=>del(a.id)}><I.trash/></button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <AdminCalendar appts={appts} onMarkDone={markDone} onDelete={del}/>
        )}
      </div>
    </div>
  );
}

function AdminCalendar({ appts, onMarkDone, onDelete }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDate, setSelDate] = useState(new Date());

  const days = useMemo(()=>{
    const y=cursor.getFullYear(), m=cursor.getMonth();
    const first=new Date(y,m,1);
    const startOffset=(first.getDay()+6)%7;
    const daysInMonth=new Date(y,m+1,0).getDate();
    const cells=[];
    for(let i=0;i<startOffset;i++) cells.push({d:null});
    for(let i=1;i<=daysInMonth;i++) cells.push({d:new Date(y,m,i)});
    return cells;
  },[cursor]);

  const dayCount = (d) => !d ? 0 : appts.filter(a=>a.date===keyDate(d)).length;
  const selList = selDate ? appts.filter(a=>a.date===keyDate(selDate)).sort((a,b)=>a.time.localeCompare(b.time)) : [];

  return (
    <div className="appts" style={{padding:18}}>
      <div className="appts-head" style={{padding:"0 0 14px"}}>
        <h3>{MONTH_ES[cursor.getMonth()]} {cursor.getFullYear()}</h3>
        <div className="cal-nav" style={{display:"flex",gap:6}}>
          <button onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))} style={{width:36,height:36,border:"1px solid var(--line-2)"}}>{I.chev("L")}</button>
          <button onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))} style={{width:36,height:36,border:"1px solid var(--line-2)"}}>{I.chev("R")}</button>
        </div>
      </div>
      <div className="cal-grid" style={{marginBottom:24}}>
        {DOW_ES.map(d=><div key={d} className="cal-dow">{d}</div>)}
        {days.map((c,i)=>{
          if(!c.d) return <div key={i} className="cal-day other"></div>;
          const n = dayCount(c.d);
          const isSel = selDate && sameDay(selDate, c.d);
          const isToday = sameDay(c.d, new Date());
          return (
            <div key={i}
              className={"cal-day"+(isSel?" selected":"")+(isToday?" today":"")}
              style={{cursor:"pointer",minHeight:80,aspectRatio:"auto",alignItems:"start",justifyContent:"start",padding:"6px 8px",display:"flex",flexDirection:"column",gap:4}}
              onClick={()=>setSelDate(new Date(c.d))}>
              <span className="num" style={{fontSize:16}}>{c.d.getDate()}</span>
              {n>0 && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:".1em",color:isSel?"var(--ink)":"var(--cream-2)"}}>{n} cita{n>1?"s":""}</span>}
              {n>0 && <div style={{display:"flex",gap:2,marginTop:"auto"}}>{[...Array(Math.min(n,4))].map((_,j)=><span key={j} style={{width:5,height:5,borderRadius:"50%",background:isSel?"var(--ink)":"var(--accent-2)"}}/>)}</div>}
            </div>
          );
        })}
      </div>
      <div style={{borderTop:"1px solid var(--line)",paddingTop:18}}>
        <h4 style={{fontFamily:"'Bodoni Moda',serif",fontWeight:500,fontSize:20,margin:"0 0 14px"}}>
          {selDate ? prettyDate(selDate) : "Selecciona un día"}
        </h4>
        {selList.length===0 ? (
          <div className="empty" style={{padding:"30px 0"}}>Sin citas este día.</div>
        ) : selList.map(a=>{
          const svc=SERVICES.find(s=>s.id===a.service);
          return (
            <div key={a.id} className={"appt"+(a.status==="done"?" done":"")} style={{borderTop:"1px solid var(--line)",padding:"14px 0"}}>
              <div className="when"><div className="d" style={{fontSize:18}}>{a.time}</div></div>
              <div className="who"><div className="n">{a.name}</div><div className="svc">{svc?.name}</div></div>
              <div className="contact">{a.phone}</div>
              <div className={"status "+(a.status==="upcoming"?"up":"dn")}>{a.status==="upcoming"?"Programada":"Completada"}</div>
              <div className="actions">
                {a.status==="upcoming" && <button onClick={()=>onMarkDone(a.id)}><I.check/></button>}
                <button className="del" onClick={()=>onDelete(a.id)}><I.trash/></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ */
/*  ROOT + TWEAKS                                                */
/* ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#7a1f24",
  "accentLabel": "oxblood",
  "showWhatsapp": true,
  "gridDensity": "comfortable"
}/*EDITMODE-END*/;

const ACCENT_PRESETS = [
  { label:"oxblood", primary:"#7a1f24", secondary:"#a83138" },
  { label:"brass",   primary:"#8a6b2e", secondary:"#c69a4f" },
  { label:"forest",  primary:"#1f4a3a", secondary:"#2e7d5a" },
  { label:"ink",     primary:"#3a3a40", secondary:"#7a7a80" }
];

function App() {
  const [route, setRoute] = useState(() => location.hash==="#admin" ? "admin" : "site");
  const [appts, setAppts] = useState(loadAppts);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = useState(false);

  useEffect(()=>{
    const preset = ACCENT_PRESETS.find(p=>p.label===tweaks.accentLabel) || ACCENT_PRESETS[0];
    document.documentElement.style.setProperty("--accent", preset.primary);
    document.documentElement.style.setProperty("--accent-2", preset.secondary);
  },[tweaks.accentLabel]);

  useEffect(()=>{
    const onMsg = (e)=>{
      if(!e.data) return;
      if(e.data.type==="__activate_edit_mode") setEditMode(true);
      if(e.data.type==="__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return ()=>window.removeEventListener("message", onMsg);
  },[]);

  const setTweak = (k, v) => {
    const next = {...tweaks, [k]:v};
    setTweaks(next);
    window.parent.postMessage({type:"__edit_mode_set_keys", edits:{[k]:v}}, "*");
  };

  const goAdmin = () => { setRoute("admin"); location.hash="#admin"; window.scrollTo(0,0); };
  const goSite  = () => { setRoute("site");  location.hash=""; window.scrollTo(0,0); };

  return (
    <>
      {route==="site"
        ? <ClientSite appts={appts} setAppts={setAppts} onGoAdmin={goAdmin} tweaks={tweaks}/>
        : <Admin appts={appts} setAppts={setAppts} onExit={goSite}/>}

      {editMode && (
        <div className="tweaks">
          <h4>Tweaks <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)",letterSpacing:".15em"}}>V1</span></h4>
          <label>Acento</label>
          <div className="swatches">
            {ACCENT_PRESETS.map(p=>(
              <div key={p.label}
                className={"sw"+(tweaks.accentLabel===p.label?" on":"")}
                style={{background:`linear-gradient(90deg, ${p.primary} 0 50%, ${p.secondary} 50% 100%)`}}
                title={p.label}
                onClick={()=>setTweak("accentLabel", p.label)}/>
            ))}
          </div>
          <label style={{marginTop:16}}>WhatsApp flotante</label>
          <select value={tweaks.showWhatsapp?"yes":"no"} onChange={e=>setTweak("showWhatsapp", e.target.value==="yes")}>
            <option value="yes">Visible</option>
            <option value="no">Oculto</option>
          </select>
          <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid var(--line)",display:"flex",gap:6,flexWrap:"wrap"}}>
            <button className="btn-ghost" style={{padding:"8px 10px",fontSize:10}} onClick={route==="site"?goAdmin:goSite}>
              {route==="site" ? "→ Ver panel" : "→ Ver sitio"}
            </button>
            <button className="btn-ghost" style={{padding:"8px 10px",fontSize:10}} onClick={()=>{ localStorage.removeItem(STORAGE); setAppts(loadAppts()); }}>
              Reset citas
            </button>
          </div>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
