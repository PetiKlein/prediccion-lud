// Baja la planilla de cada partido jugado (titulares, cambios, goles, expulsados) de las
// categorías de categorias.mjs y la guarda en data/partidos/<categoria>/<ID>.json.
// Solo baja lo que falta, así que correrlo seguido es barato. Un partido se vuelve a bajar
// durante 4 días después de jugado (la Liga a veces carga o corrige la planilla tarde) y
// siempre que todavía no tenga titulares. Con REBAJAR=1 baja todo de nuevo.
// Los amonestados no se piden: la Liga no los carga y en la LUD no hay acumulación de amarillas.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TEMPORADA } from './lud.mjs';
import { CATEGORIAS } from './categorias.mjs';

const BASE = 'https://ligauniversitaria.org.uy/resultados/api.php';
const BASE_FIXTURE = 'https://ligauniversitaria.org.uy/partidos/api.php';
const REBAJAR = process.env.REBAJAR === '1';

const ACCIONES = {
  detalle: 'cargarDetallesPartido',
  titularesL: 'Titulares Locatario',
  titularesV: 'Titulares Visitante',
  cambiosL: 'CambiosLocatario',
  cambiosV: 'CambiosVisitante',
  golesL: 'GolesLocatario',
  golesV: 'GolesVisitante',
  expulsadosL: 'Expulsados Locatario',
  expulsadosV: 'Expulsados Visitante',
};

const espera = ms => new Promise(r => setTimeout(r, ms));
async function api(params, base = BASE) {
  const q = new URLSearchParams(params).toString().replace(/\+/g, '%20');
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(`${base}?${q}`, { headers: { 'User-Agent': 'prediccion-lud (penca de amigos)' }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = (await r.text()).trim();
      if (!txt) return [];
      const j = JSON.parse(txt);
      return Array.isArray(j) ? j : []; // {"error": "No se encontraron..."} = lista vacía
    } catch (e) {
      if (intento >= 3) throw new Error(`${params.action} ${params.id ?? ''}: ${e.message}`);
      await espera(2000 * intento);
    }
  }
}

for (const cat of CATEGORIAS) {
  const DIR = new URL(`../data/partidos/${cat.id}/`, import.meta.url);
  mkdirSync(DIR, { recursive: true });
  let bajados = 0, salteados = 0, sinJugar = 0;
  const tareas = [], proximos = [];
  for (const serie of Object.keys(cat.series)) {
    const lista = await api({ action: 'cargarPartidos', temporada: TEMPORADA, deporte: 'F', torneo: cat.torneo, categoria: cat.categoria, serie });
    for (const p of lista) tareas.push({ serie, p });
    const fixture = await api({ action: 'cargarPartidos', temporada: TEMPORADA, deporte: 'F', torneo: cat.torneo, categoria: cat.categoria, serie }, BASE_FIXTURE);
    for (const f of fixture) proximos.push({ serie, fechaHora: f.Fecha, cancha: f.Cancha, local: f.Locatario, visitante: f.Visitante });
  }
  // Próximos partidos (fixture sin resultado), para mostrar el rival de cada equipo.
  writeFileSync(new URL('_proximos.json', DIR), JSON.stringify(proximos.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora)), null, 1) + '\n');
  // De a 4 partidos por vez, para no saturar a la Liga.
  const cola = [...tareas];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let t; (t = cola.shift());) {
      const { serie, p } = t;
      if (p.GL === '' || p.GL == null) { sinJugar++; continue; } // todavía no se jugó
      const archivo = new URL(`${p.ID}.json`, DIR);
      const jugado = new Date(p.Fecha_Hora.replace(' ', 'T') + '-03:00');
      const reciente = Date.now() - jugado.getTime() < 4 * 864e5;
      if (!REBAJAR && existsSync(archivo) && !reciente) {
        const viejo = JSON.parse(readFileSync(archivo));
        if (viejo.titularesL?.length && viejo.titularesV?.length) { salteados++; continue; }
      }
      const out = { id: p.ID, categoria: cat.id, serie, fecha: Number(p.Fecha), fechaHora: p.Fecha_Hora, cancha: p.Cancha, local: p.Locatario, visitante: p.Visitante, gl: Number(p.GL), gv: Number(p.GV) };
      const partes = await Promise.all(Object.entries(ACCIONES).map(async ([k, action]) => [k, await api({ action, id: p.ID })]));
      Object.assign(out, Object.fromEntries(partes));
      out.detalle = out.detalle[0] || null;
      writeFileSync(archivo, JSON.stringify(out, null, 1) + '\n');
      bajados++;
    }
  }));
  console.log(`${cat.nombre}: bajados ${bajados}, ya estaban ${salteados}, sin jugar ${sinJugar}.`);
}
