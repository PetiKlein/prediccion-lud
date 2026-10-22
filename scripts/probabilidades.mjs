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

const res = await fetch(URL_CALC, { headers: { 'User-Agent': 'prediccion-lud (penca de amigos)' } });
if (!res.ok) { console.log(`La calculadora respondió ${res.status}; no se cambia nada.`); process.exit(0); }
const html = await res.text();
writeFileSync(CRUDO, html);

// Pasar el HTML a una lista de textos visibles, en orden.
const textos = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'")
  .split('\n').map(t => t.trim()).filter(Boolean);

// Buscar: equipo, (texto opcional), equipo, y después tres porcentajes seguidos.
const partidos = []; const vistos = new Set();
const pct = t => { const m = t.match(/^(\d{1,3})\s*%$/); return m ? Number(m[1]) : null; };
for (let i = 0; i < textos.length; i++) {
  const a = corto(textos[i]); if (!a) continue;
  let j = i + 1, b = null;
  for (; j < Math.min(i + 6, textos.length); j++) { b = corto(textos[j]); if (b && b !== a) break; b = null; }
  if (!b) continue;
  const nums = [];
  for (let k = j + 1; k < Math.min(j + 14, textos.length) && nums.length < 3; k++) {
    if (corto(textos[k])) break;
    const n = pct(textos[k]); if (n != null) nums.push(n);
  }
  if (nums.length < 3) continue;
  const suma = nums[0] + nums[1] + nums[2];
  if (suma < 97 || suma > 103) continue;
  const key = a + '|' + b; if (vistos.has(key)) continue; vistos.add(key);
  partidos.push({ local: a, visitante: b, L: nums[0], E: nums[1], V: nums[2] });
  i = j;
}

console.log(`Partidos leídos: ${partidos.length}`);
for (const p of partidos) console.log(`  ${p.local} ${p.L}% · ${p.E}% · ${p.V}% ${p.visitante}`);
if (partidos.length < 4) { console.log('Muy pocos partidos; no se cambia el archivo.'); process.exit(0); }

let anterior = null; try { anterior = JSON.parse(readFileSync(SALIDA, 'utf8')); } catch {}
const igual = anterior && JSON.stringify(anterior.partidos) === JSON.stringify(partidos);
if (igual) { console.log('Sin cambios.'); process.exit(0); }
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
writeFileSync(SALIDA, JSON.stringify({ fuente: 'Calculadora LUD', url: URL_CALC, actualizado: hoy, partidos }, null, 1) + '\n');
console.log('Archivo actualizado.');
