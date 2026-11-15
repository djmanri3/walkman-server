# Letras y traducción

Las letras se buscan primero en el origen de la pista reproducida. No se consulta
LRCLIB mientras haya letras disponibles en ese origen, aunque no estén sincronizadas.

- Emby: `/Items/{id}/Lyrics`, con respaldo `/Audio/{id}/Lyrics` para compatibilidad.
- Jellyfin: `/Audio/{id}/Lyrics`; admite listas `Lyrics` y pistas `Tracks`.
- Plex: metadatos de la canción y streams de letras (`streamType=4`), preferentemente
  sincronizados. El token solo se envía al servidor Plex conectado.
- Local: letras entregadas en `Lyrics`/`lyrics`, archivos `.lrc` o `.txt` con el mismo
  nombre base y en la misma carpeta, y etiquetas incrustadas que pueda leer jsmediatags.
  Los archivos acompañantes se incluyen al importar la carpeta en el navegador.
  El puente Android debe entregar `Lyrics`/`lyrics` para exponer sus letras: este
  repositorio web no puede leer por sí solo los archivos vecinos de una URI SAF.

Si el origen no contiene letras o no permite obtenerlas, se consulta LRCLIB.
Las letras sin sincronizar se muestran sin seguimiento temporal. El lector LRC
admite varias marcas por línea, fracciones de segundo y desplazamiento `offset`.

La traducción elimina líneas repetidas y envía bloques de hasta aproximadamente
1.400 caracteres a Google, con hasta tres bloques simultáneos. Si el servicio no
conserva las líneas, se traducen individualmente. MyMemory sigue como respaldo.
Cada petición tiene un plazo de seis segundos. Las traducciones completas se
reutilizan durante la sesión (hasta 30 combinaciones de letra e idioma); los fallos
no se guardan. La caché es en memoria, sin persistir las letras en el navegador.
Cambiar de canción o idioma descarta respuestas anteriores.

Verificación local con respuestas simuladas:

```sh
node tests/lyrics/lyrics.test.js
```

Referencias de los formatos:
[Jellyfin LyricLine](https://typescript-sdk.jellyfin.org/interfaces/generated-client.LyricLine.html),
[Plex LyricStream](https://python-plexapi.readthedocs.io/en/master/modules/media.html).
