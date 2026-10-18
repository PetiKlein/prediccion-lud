// Robot de resultados: baja fixture y resultados de la LUD y los guarda en Firestore.
// Corre en GitHub Actions (ver .github/workflows/resultados.yml). Necesita el secreto
// FIREBASE_SERVICE_ACCOUNT con el JSON de la cuenta de servicio de Firebase.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { bajar, transformar } from './lud.mjs';

const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!cred) { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT.'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(cred)) });
const db = getFirestore();

// 1) Jugadores: se crean desde data/jugadores.json si no existen. Nunca se pisa quién reclamó cada nombre.
const lista = JSON.parse(readFileSync(new URL('../data/jugadores.json', import.meta.url)));
const jugSnap = await db.collection('jugadores').get();
const jugExist = new Set(jugSnap.docs.map(d => d.id));
let nuevosJug = 0;
for (const j of lista) {
  if (jugExist.has(j.id)) continue;
  await db.collection('jugadores').doc(j.id).set({ nombre: j.nombre, base: j.base ?? 0, uid: null, cuentaNombre: null });
  nuevosJug++;
}

// 2) Partidos.
const partSnap = await db.collection('partidos').get();
const existentes = Object.fromEntries(partSnap.docs.map(d => [d.id, d.data()]));
const datos = await bajar();
const partidos = transformar(datos, existentes);

const cambios = [];
let batch = db.batch(), enBatch = 0;
for (const [id, p] of Object.entries(partidos)) {
  const ant = existentes[id];
  // Un resultado ya cargado no se borra si la Liga deja de mostrarlo.
  if (ant && ant.gl != null && p.gl == null) { p.gl = ant.gl; p.gv = ant.gv; }
  const igual = ant && ['fecha', 'dia', 'hora', 'horaAConfirmar', 'cancha', 'gl', 'gv', 'local', 'visitante', 'zona']
    .every(k => ant[k] === p[k]) && ant.cierre?.toMillis?.() === p.cierre.getTime();
  if (igual) continue;
  if (!ant) cambios.push(`Nuevo: F${p.fecha} ${p.local} vs ${p.visitante}`);
  else if (ant.gl == null && p.gl != null) cambios.push(`Resultado F${p.fecha} (${p.zona}): ${p.local} ${p.gl}-${p.gv} ${p.visitante}`);
  else cambios.push(`Actualizado: F${p.fecha} ${p.local} vs ${p.visitante}`);
  batch.set(db.collection('partidos').doc(id), { ...p, actualizado: new Date() }, { merge: true });
  if (++enBatch === 400) { await batch.commit(); batch = db.batch(); enBatch = 0; }
}
if (enBatch) await batch.commit();

// Partidos que ya deberían tener resultado y la Liga todavía no cargó.
const pendientes = Object.values(partidos)
  .filter(p => p.gl == null && p.cierre.getTime() < Date.now() - 4 * 3600e3)
  .map(p => `F${p.fecha} ${p.local} vs ${p.visitante}`);

console.log(`Jugadores nuevos: ${nuevosJug}`);
console.log(cambios.length ? cambios.join('\n') : 'Sin cambios en partidos.');
if (pendientes.length) {
  console.log(`\nSin resultado en la Liga todavía:\n${pendientes.join('\n')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Sin resultado en la Liga todavía\n${pendientes.map(x => `- ${x}`).join('\n')}\n`);
  }
}
