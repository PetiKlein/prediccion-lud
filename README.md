# Predicción LUD

La penca del grupo para la Divisional A de Mayores de la Liga Universitaria de Deportes.

Página: https://petiklein.github.io/prediccion-lud

## Cómo funciona

- Cada uno entra con su cuenta de Google y reclama su nombre una sola vez.
- Se pronostica ganador o empate en cada partido. Cada acierto vale 1 punto.
- Todos los partidos de una fecha cierran el domingo a las 9:00 (un partido que se juega antes cierra a su hora). El cierre lo controla Firebase, no la página.
- Los resultados se cargan solos con GitHub Actions: domingos 14:05 y 18:05, y lunes a miércoles 20:05 (hora de Montevideo).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | La página |
| `firebase-config.js` | Configuración pública del proyecto de Firebase |
| `firestore.rules` | Reglas de seguridad. Se pegan en Firebase > Firestore Database > Reglas |
| `data/jugadores.json` | Los jugadores y los puntos que traían. Para sumar a alguien, agregalo acá |
| `scripts/` | El robot que lee la Liga y actualiza Firebase |
| `.github/workflows/resultados.yml` | Cuándo corre el robot |

## Puesta en marcha (una sola vez)

1. **Firebase**: crear el proyecto, activar Authentication con Google, crear Firestore en `southamerica-east1`, registrar la app web y pegar su `firebaseConfig` en `firebase-config.js`.
2. **Dominio autorizado**: Authentication > Configuración > Dominios autorizados > agregar `petiklein.github.io`.
3. **Reglas**: Firestore Database > Reglas > pegar el contenido de `firestore.rules` > Publicar.
4. **Clave del robot**: Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada. Se descarga un `.json`. En GitHub: Settings > Secrets and variables > Actions > New repository secret, nombre `FIREBASE_SERVICE_ACCOUNT`, pegar todo el contenido del `.json`. Después borrá el archivo de tu compu. Nunca lo subas al repositorio.
5. **Primera carga**: GitHub > Actions > Resultados de la Liga > Run workflow. Carga jugadores, fixture y resultados.
6. **Publicar la página**: GitHub > Settings > Pages > Source: Deploy from a branch, rama `main`, carpeta `/ (root)` > Save.

## Cambio de etapa

Las series de la Liga están en `scripts/lud.mjs` (`ETAPAS`). Cuando la Liga arranque una etapa nueva con otros códigos de serie, hay que actualizarlos ahí.

## Si alguien reclama el nombre equivocado

En Firebase > Firestore Database: en `jugadores/<nombre>` poner `uid` y `cuentaNombre` en `null`, y borrar el documento `cuentas/<uid>` de esa persona.
