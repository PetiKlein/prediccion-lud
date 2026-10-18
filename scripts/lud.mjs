// Lee el fixture y los resultados de la Liga Universitaria de Deportes (LUD)
// y los convierte al formato de la penca. No escribe nada: eso lo hace actualizar.mjs.

export const TEMPORADA = 113; // temporada 2026 en el sistema de la LUD
export const ETAPAS = [
  { serie: 'AT', zona: 'Título' },
  { serie: 'APD', zona: 'Permanencia' },
];

export const NOMBRES = {
  'E.L.F.': 'ELF',
  'TAPE': 'TAPE',
  'OLD BOYS CLUB': 'Old Boys',
  'OLD WOODLANDS CLUB': 'Old Woodlands',
  'CARRASCO POLO CLUB': 'Carrasco Polo',
  'TENIS EL PINAR': 'Tenis El Pinar',
  'URUNDAY UNIVERSITARIO': 'Urunday',
  'NACIONAL UNIVERSITARIO': 'Nacional U.',
  'SANTA ELENA LAGOMAR': 'Santa Elena',
  'HEBRAICA UNIVERSITARIO': 'Hebraica y Macabi',
  'CARRASCO LAWN TENNIS': 'Carrasco Lawn Tennis',
  'OLD IVY': 'Old Ivy',
  'JUAN XXIII': 'Juan XXIII',
  'CLUB SEMINARIO': 'Seminario',
  'PLAYA HONDA UNIVERSITARIO': 'Playa Honda',
  'OLD CHRISTIANS CLUB': 'Old Christians',
};

const titleCase = s => s.toLowerCase().replace(/(^|[\s(.-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
export const corto = n => NOMBRES[n.trim()] || titleCase(n.trim());
export const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function cancha(c) {
  c = (c || '').trim();
  if (!c || c === '()' || c === 'CANCHA A FIJAR') return 'Cancha a fijar';
  return titleCase(c.replace(/"/g, '')).replace(/Xxiii/g, 'XXIII').replace(/^Elf /, 'ELF ');
}

const url = (tipo, serie) =>
  `https://ligauniversitaria.org.uy/${tipo}/api.php?action=cargarPartidos&temporada=${TEMPORADA}&deporte=F&torneo=2&categoria=1&serie=${serie}`;

export async function bajar(fetchImpl = fetch) {
  const out = {};
  for (const { serie } of ETAPAS) {
    for (const tipo of ['resultados', 'partidos']) {
      const r = await fetchImpl(url(tipo, serie), { headers: { 'User-Agent': 'prediccion-lud (penca de amigos)' } });
      if (!r.ok) throw new Error(`La LUD respondió ${r.status} en ${tipo} ${serie}`);
      const txt = await r.text();
      out[`${tipo}-${serie}`] = txt.trim() ? JSON.parse(txt) : [];
    }
  }
  return out;
}

// Fecha y hora de Montevideo (UTC-3, sin horario de verano).
const enMvd = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`);
const diaSemana = dia => enMvd(dia, '12:00').getUTCDay();
const sumarDias = (dia, n) => { const d = enMvd(dia, '12:00'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Cada fecha se juega alrededor de un domingo. Un partido de viernes o martes va con el domingo más cercano.
export function domingoCercano(dia) {
  const w = diaSemana(dia);
  return w === 0 ? dia : w <= 3 ? sumarDias(dia, -w) : sumarDias(dia, 7 - w);
}

// La fecha cierra el domingo a las 9:00. Si un partido empieza antes, ese partido cierra a su hora.
export function cierre(dia, hora, horaAConfirmar) {
  const dom = enMvd(domingoCercano(dia), '09:00');
  if (horaAConfirmar) return dom;
  const k = enMvd(dia, hora);
  return k < dom ? k : dom;
}

// existentes: { [id]: {fecha} } para no renumerar partidos ya cargados.
export function transformar(datos, existentes = {}) {
  const partidos = {};
  for (const { serie, zona } of ETAPAS) {
    const pre = serie.toLowerCase();
    const res = datos[`resultados-${serie}`] || [];
    const pro = datos[`partidos-${serie}`] || [];
    const domingoDeFecha = {};
    const add = (r, fechaHora, gl, gv, fecha) => {
      const [dia, hh] = fechaHora.split(' ');
      const hora = hh.slice(0, 5);
      const local = corto(r.Locatario), visitante = corto(r.Visitante);
      const id = `${pre}-${slug(local)}-${slug(visitante)}`;
      const horaAConfirmar = hora === '00:00';
      partidos[id] = {
        etapa: serie, zona, fecha, dia, hora, horaAConfirmar, local, visitante,
        cancha: cancha(r.Cancha), gl, gv,
        cierre: cierre(dia, hora, horaAConfirmar),
      };
    };
    for (const r of res) {
      const f = Number(r.Fecha);
      domingoDeFecha[domingoCercano(r.Fecha_Hora.slice(0, 10))] ??= f;
      const gl = r.GL === '' || r.GL == null ? null : Number(r.GL);
      const gv = r.GV === '' || r.GV == null ? null : Number(r.GV);
      add(r, r.Fecha_Hora, gl, gv, f);
    }
    // Los próximos partidos no traen número de fecha: se numeran por domingo, siguiendo a la última jugada.
    const maxJugada = Math.max(0, ...res.map(r => Number(r.Fecha)));
    const domingos = [...new Set(pro.map(p => domingoCercano(p.Fecha.slice(0, 10))))]
      .filter(d => !(d in domingoDeFecha)).sort();
    domingos.forEach((d, i) => { domingoDeFecha[d] = maxJugada + i + 1; });
    for (const p of pro) {
      const local = corto(p.Locatario), visitante = corto(p.Visitante);
      const id = `${pre}-${slug(local)}-${slug(visitante)}`;
      if (partidos[id]) continue; // ya figura con resultado
      const fecha = existentes[id]?.fecha ?? domingoDeFecha[domingoCercano(p.Fecha.slice(0, 10))];
      add(p, p.Fecha, null, null, fecha);
    }
  }
  return partidos;
}
