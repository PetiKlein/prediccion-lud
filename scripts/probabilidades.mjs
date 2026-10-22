// Baja las probabilidades por partido de Calculadora LUD y las guarda en data/probabilidades.json.
// Corre en GitHub Actions (ver .github/workflows/probabilidades.yml). Si no logra leer la página,
// deja el archivo como estaba, así la penca nunca se queda sin datos.
import { readFileSync, writeFileSync } from 'node:fs';

const URL_CALC = 'https://calculadora-lud.vercel.app/mayores/a';
const SALIDA = new URL('../data/probabilidades.json', import.meta.url);
const CRUDO = new URL('../data/_calculadora.html', import.meta.url);

// Nombres de la calculadora -> nombres cortos de la penca.
const NOMBRES = {
  'urunday universitario': 'Urunday', 'old boys club': 'Old Boys', 'nacional universitario': 'Nacional U.',
  'old woodlands club': 'Old Woodlands', 'e.l.f.': 'ELF', 'elf': 'ELF', 'tape': 'TAPE',
  'carrasco polo club': 'Carrasco Polo', 'tenis el pinar': 'Tenis El Pinar', 'santa elena lagomar': 'Santa Elena',
  'hebraica universitario': 'Hebraica y Macabi', 'carrasco lawn tennis': 'Carrasco Lawn Tennis', 'old ivy': 'Old Ivy',
  'juan xxiii': 'Juan XXIII', 'club seminario': 'Seminario', 'playa honda universitario': 'Playa Honda',
  'old christians club': 'Old Christians',
};
const corto = n => NOMBRES[n.trim().toLowerCase()] || null;

// PRUEBA=archivo.html lee una copia guardada y no escribe nada (para probar el lector).
const PRUEBA = process.env.PRUEBA;
let html;
if (PRUEBA) html = readFileSync(PRUEBA, 'utf8');
else {
  // Si la calculadora no responde, el robot falla (código 1) para que el workflow abra un aviso.
  let res;
  try { res = await fetch(URL_CALC, { headers: { 'User-Agent': 'prediccion-lud (penca de amigos)' } }); }
  catch (e) { console.error(`No se pudo conectar con la calculadora: ${e.message}`); process.exit(1); }
  if (!res.ok) { console.error(`La calculadora respondió ${res.status}. Puede que la página ya no exista.`); process.exit(1); }
  html = await res.text();
}

// Pasar el HTML a una lista de textos visibles, en orden.
const textos = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'")
  .split('\n').map(t => t.trim()).filter(Boolean);

// Solo la sección "Partidos que quedan" (hasta "Resultados"). Cada partido viene como:
// fecha, local, "52%", visitante, "23%", "Empate", "25%".
const desde = textos.indexOf('Partidos que quedan');
const hasta = textos.indexOf('Resultados', desde + 1);
const seccion = desde >= 0 ? textos.slice(desde + 1, hasta > desde ? hasta : undefined) : [];
const pct = t => { const m = t.match(/^(\d{1,3})(?:[.,]\d+)?\s*%$/); return m ? Number(m[1]) : null; };
const partidos = []; const vistos = new Set();
for (let i = 0; i + 5 < seccion.length; i++) {
  const a = corto(seccion[i]); if (!a) continue;
  const pl = pct(seccion[i + 1]); const b = corto(seccion[i + 2]); const pv = pct(seccion[i + 3]);
  const esEmp = /^empate$/i.test(seccion[i + 4]); const pe = pct(seccion[i + 5]);
  if (pl == null || !b || pv == null || !esEmp || pe == null) continue;
  const suma = pl + pv + pe; if (suma < 97 || suma > 103) continue;
  const key = a + '|' + b; if (vistos.has(key)) continue; vistos.add(key);
  partidos.push({ local: a, visitante: b, L: pl, E: pe, V: pv });
  i += 5;
}

console.log(`Partidos leídos: ${partidos.length}`);
for (const p of partidos) console.log(`  ${p.local} ${p.L}% · ${p.E}% · ${p.V}% ${p.visitante}`);
if (partidos.length < 4) {
  // Probablemente cambió la página: se guarda una copia para revisar el lector.
  if (!PRUEBA) writeFileSync(CRUDO, html);
  console.error('No se encontraron los partidos en la página: puede que haya cambiado. Se mantienen los datos anteriores.');
  process.exit(PRUEBA ? 0 : 1);
}
if (PRUEBA) process.exit(0);

let anterior = null; try { anterior = JSON.parse(readFileSync(SALIDA, 'utf8')); } catch {}
const igual = anterior && JSON.stringify(anterior.partidos) === JSON.stringify(partidos);
if (igual) { console.log('Sin cambios.'); process.exit(0); }
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
writeFileSync(SALIDA, JSON.stringify({ fuente: 'Calculadora LUD', url: URL_CALC, actualizado: hoy, partidos }, null, 1) + '\n');
console.log('Archivo actualizado.');
