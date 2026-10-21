// Baja el detalle de cada partido jugado de Mayores A (titulares, cambios, goles, tarjetas)
// y lo guarda en data/partidos/<ID>.json. Solo baja lo que falta, así que correrlo seguido es barato.
// Un partido se vuelve a bajar durante 4 días después de jugado, por si la Liga carga la planilla tarde.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TEMPORADA } from './lud.mjs';

const BASE = 'https://ligauniversitaria.org.uy/resultados/api.php';
const SERIES = ['A', 'AT', 'APD']; // primera rueda, título, permanencia
const DIR = new URL('../data/partidos/', import.meta.url);
mkdirSync(DIR, { recursive: true });

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
  amonestadosL: 'Amonestados Locatario',
  amonestadosV: 'Amonestados Visitante',
};

const espera = ms => new Promise(r => setTimeout(r, ms));
async function api(params) {
  const q = new URLSearchParams(params).toString().replace(/\+/g, '%20');
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(`${BASE}?${q}`, { headers: { 'User-Agent': 'prediccion-lud (penca de amigos)' } });
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

let bajados = 0, salteados = 0;
for (const serie of SERIES) {
  const lista = await api({ action: 'cargarPartidos', temporada: TEMPORADA, deporte: 'F', torneo: 2, categoria: 1, serie });
  for (const p of lista) {
    if (p.GL === '' || p.GL == null) continue; // todavía no se jugó
    const archivo = new URL(`${p.ID}.json`, DIR);
    const jugado = new Date(p.Fecha_Hora.replace(' ', 'T') + '-03:00');
    const reciente = Date.now() - jugado.getTime() < 4 * 864e5;
    if (existsSync(archivo) && !reciente) {
      const viejo = JSON.parse(readFileSync(archivo));
      if (viejo.titularesL.length && viejo.titularesV.length) { salteados++; continue; }
    }
    const out = { id: p.ID, serie, fecha: Number(p.Fecha), fechaHora: p.Fecha_Hora, local: p.Locatario, visitante: p.Visitante, gl: Number(p.GL), gv: Number(p.GV) };
    for (const [k, action] of Object.entries(ACCIONES)) {
      out[k] = await api({ action, id: p.ID });
      await espera(120);
    }
    writeFileSync(archivo, JSON.stringify(out, null, 1) + '\n');
    bajados++;
  }
}
console.log(`Partidos bajados: ${bajados}. Ya estaban: ${salteados}.`);
