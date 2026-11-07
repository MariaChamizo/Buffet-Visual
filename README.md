# Buffet Visual

Extensión para observar qué ves mientras comes y convertir el tiempo en un
plato de vídeos, imágenes, hashtags y sabores.

La versión **3.9.0** funciona en Chrome, Edge y Brave desde Chromium 116.
No necesita servidor, Python, PHP ni cuentas. Usa Kode Mono, incluida localmente.
El icono muestra **BV** con la misma tipografía Kode Mono de la página.

## Publicar la web y compartir el proyecto en GitHub

Cada uno usa su cuenta. Para empezar basta un repositorio de uno de los dos
con el otro como colaborador. Ambos podréis cambiar código y proponer mejoras;
el propietario administra sus ajustes. [Invitar colaboradores](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository).

### Subir esta carpeta

1. Instalad [GitHub Desktop](https://desktop.github.com/) e iniciad sesión.
2. En **File → Add local repository**, seleccionad esta carpeta `Tracker`.
   Si todavía no es un repositorio, elegid **create a repository here instead**.
   Comprobad que la ruta final sea esta carpeta, sin crear otra `Tracker` dentro.
   Conservad el README y el `.gitignore` existentes.
3. Usad la rama **main**; si tiene otro nombre, renombradla antes de publicar.
   Revisad los archivos, cread un commit si hay cambios
   pendientes y pulsad **Publish repository**. Podéis llamarlo `buffet-visual`.
4. Desmarcad **Keep this code private** para usar GitHub Pages con GitHub Free
   y publicad el repositorio.

Los pasos de publicación están explicados en la
[guía de GitHub Desktop](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop).
Usad Desktop para subirlo: respeta `.gitignore`. Arrastrar toda la carpeta a la
web de GitHub no aplica esas exclusiones.

### Dar acceso a los dos

El propietario abre el repositorio en GitHub y entra en
**Settings → Collaborators → Add people**. Busca la cuenta del otro y envía
la invitación; la otra persona debe aceptarla y clonar el repositorio desde
GitHub Desktop. Si queréis que los dos seáis propietarios, podéis crear una
[organización](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations)
y asignaros ese rol.

### Activar la web y la descarga

1. En el repositorio, abrid **Settings → Pages**.
2. En **Build and deployment → Source**, seleccionad **GitHub Actions**.
3. Abrid **Actions**, elegid el flujo **Publicar Buffet Visual** y pulsad
   **Run workflow** sobre `main`.
4. Cuando termine, el despliegue mostrará la dirección de la web. Si el
   repositorio se llama `buffet-visual`, será
   `https://VUESTRO-USUARIO.github.io/buffet-visual/`.

GitHub Pages gratuito requiere un repositorio público; los planes que admiten
Pages privado tienen otras condiciones. Los pasos de configuración están en
la [documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

El flujo incluido compila Sass, ejecuta las pruebas del reloj, genera un ZIP
de la extensión y prepara solo los archivos públicos de la landing. Después
los publica con las acciones oficiales de Pages. Los enlaces funcionan también
cuando la web está dentro de `/buffet-visual/`; no hay que editar el nombre del
repositorio en el HTML. La descarga se instala descomprimiendo el ZIP y usando
**Cargar descomprimida**, como explica la página del camarero.

Los siguientes cambios que enviéis a `main` actualizarán la web y su ZIP.
Para trabajar juntos: **Fetch origin / Pull** antes de editar, una rama por
cambio, **Commit**, **Push** y una **Pull request** para revisar y unir a `main`.

### Qué se comparte

Git incluye código, recursos activos, pruebas y configuración de publicación.
`.gitignore` deja fuera `datos/`, `historial/`, `informes/`, `archivo/`, los ZIP
generados y `.preview/`. Esas carpetas locales se conservan; el historial no se
publica. El respaldo de originales supera los 100 MiB permitidos por GitHub
para un archivo normal y tampoco es necesario para usar la aplicación.
[Límites de archivos de GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

El ZIP público se construye siempre desde `extension/`, sin pruebas ni fuentes
SCSS. Así no depende de acordarse de subir una copia generada. No hacen falta
contraseñas, tokens personales ni un servidor para el despliegue de Pages.

## Instalar o actualizar

Si ya está instalada, abre la página de extensiones y pulsa **Recargar**.
Conserva la instalación actual y su carpeta para mantener el historial. El
manifiesto de la raíz permite seguir usando la instalación original del
proyecto; no lo elimines ni cargues una segunda copia.
Las claves internas de versiones anteriores se trasladan automáticamente al
actualizar, conservando el historial y la página de la tarjeta.

Para instalar por primera vez:

1. Descarga y descomprime el ZIP desde la web. Si usas el código fuente,
   conserva la carpeta `extension/`.
2. Abre `chrome://extensions`, `edge://extensions` o `brave://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona `extension/`.
5. Fija el icono y recarga las pestañas de YouTube y Twitch.

Abre `landing/index.html` directamente en el navegador, sin servidor. La portada
anima las letras con GSAP y el botón **¿Qué te apetece comer?** lleva a
`landing/camarero.html`, donde están la descarga y los pasos de instalación.
Las letras se reúnen tras una pausa de 1,1 segundos. GSAP está incluido en
`landing/assets/`, sin depender de un CDN. Los estilos se adaptan a la anchura
y la altura de la ventana. Los estilos se organizan en `landing/main.scss`
y los parciales de `landing/partials/`; `landing/styles.css` es el resultado compilado.
La portada y el camarero están pensados para ordenador. En móviles, tablets
y ventanas de menos de 768 px se muestra un aviso con el mismo estilo.
En el camarero, «Tú eliges qué comer. Tu pantalla prepara el resto.» comienza
a escribirse tras 0,8 segundos y tarda 3 segundos en completarse. Esta frase
se escribe también con movimiento reducido, con el cursor sin parpadeo.

## Durante la comida

Las tarjetas escriben letra por letra. Haz clic para avanzar: un clic durante
la escritura completa el texto y el siguiente cambia de tarjeta. Al reabrir
se conserva la página y vuelve a escribirse.

Tras avanzar por la bienvenida, **PULSA AQUÍ PARA EMPEZAR** inicia la sesión.
En **¿ha terminado ya?**, **no**
cierra la tarjeta y continúa registrando; **sí** termina y descarga el plato.

El tiempo cuenta al entrar en un dominio, sin esperar a reproducir contenido.
Solo suma la pestaña activa de una ventana con foco. Las pestañas de fondo,
las ventanas minimizadas y la suspensión no suman. Pausar un vídeo no detiene
el tiempo en pantalla. El reloj toma muestras aproximadamente cada segundo
y descarta huecos de más de 3,5 segundos.

La duración de sesión comprende desde inicio hasta final y puede superar la
suma de plataformas. Cerrar todas las ventanas, reiniciar el navegador o
recargar la extensión devuelve la bienvenida. Una comida interrumpida se
guarda hasta su última muestra, sin sumar el cierre ni descargar otro informe.

## Sabores y tarifas

| Sabor | Plataformas |
| --- | --- |
| Salado | TikTok, Twitch, YouTube y Shorts |
| Dulce | Instagram, Pinterest, Facebook y sus Reels |
| Amargo | LinkedIn, Gmail, aplicaciones de Google y Office, empleo y prensa |
| Ácido | Twitter / X |
| Umami | Netflix, Prime Video, HBO, Apple TV, Disney+, Movistar y Filmin |

Google incluye Docs, Sheets, Slides, Drive, Calendar, Meet, Chat, Keep y Forms.
Office incluye Word, Excel, PowerPoint, Outlook, OneDrive y Teams; empleo,
InfoJobs e Indeed. El buscador Google y los dominios sin clasificar conservan
su tiempo en los datos, pero quedan fuera del plato y del ticket.

| Plataforma | Estimación por minuto |
| --- | ---: |
| TikTok y YouTube Shorts | 0,0001 € |
| Prensa: Marca, El País, OkDiario y similares | 0,001 € |
| YouTube y Twitch | 0,002 € |
| Gmail, Excel y demás herramientas de trabajo | 0,002 € |
| Instagram, Twitter / X, Pinterest y Facebook | 0,003 € |
| Streaming y televisión | 0,004 € |
| LinkedIn | 0,01 € |

El cálculo es `milisegundos / 60 000 × tarifa`, sin redondear antes los minutos.
Son estimaciones del proyecto, no pagos ni ingresos reales de las plataformas.

## El plato HTML

El archivo incorpora fuente, medios, hashtags, ASCII, estilos y reproductor.
Se abre sin conexión y sin tener instalada la extensión.

Los sabores se mezclan según el tiempo. Cuatro minutos de YouTube, tres de
TikTok y tres de Instagram producen un plato 70 % salado y 30 % dulce.
Las cuotas se aplican a miniaturas, frases y fondos, redondeadas a elementos
enteros y con al menos una pieza por sabor presente.

La cantidad y la separación cambian de forma gradual entre **0 y 45 minutos**:

| Duración de la sesión | Miniaturas en el carrusel | Frases |
| --- | ---: | ---: |
| 0 minutos | 120 | 72 |
| 15 minutos | 86 | 52 |
| 22,5 minutos | 69 | 42 |
| 30 minutos | 52 | 32 |
| 45 minutos o más | 18 | 12 |

Las sesiones cortas tienen más elementos agrupados. Las largas tienen menos
miniaturas y huecos mayores. Se distribuyen en filas escalonadas con variación
aleatoria; cada fila comparte velocidad para mantener la separación durante
el bucle. La escala usa la duración completa de la sesión, incluidas sus pausas.
Se comparten hasta doce fuentes de vídeo, u ocho con un solo sabor, aunque
aparezcan más miniaturas. Las copias de una misma pieza no duplican su audio.

Vídeos y textos con hashtags avanzan de izquierda a derecha y vuelven a entrar al salir.
Al ampliar una miniatura con hover o teclado, solo ella se detiene y pierde
el pixelado. Debajo aparecen las etiquetas de su sabor separadas, sin título ni duración.
Cada texto flotante contiene un solo hashtag. Las etiquetas se reparten por sabor
y recorren una lista barajada; cambian fuera de pantalla al completar el bucle.
Los ASCII se reparten por el interior y los cuatro bordes de la pantalla,
permitiendo que queden recortados. La distribución se sortea al abrir el HTML
y se conserva al redimensionar; los tamaños se adaptan a la nueva ventana.
Los vídeos con pista de audio original suenan juntos a un volumen de fondo
del 14 %. Al ampliar uno, su sonido sube al 85 % y los demás bajan al 3 %;
al retirar el ratón se recupera la mezcla de fondo. El archivo intenta
reproducir el sonido al abrirse. **DESACTIVAR SONIDO** lo silencia sin detener
las imágenes; el botón
cambia a **ACTIVAR SONIDO** para volver a escucharlo. La elección se conserva al
ampliar vídeos, abrir el ticket o cambiar de pestaña. Si el navegador bloquea
el audio automático, se muestra **ACTIVAR SONIDO** y un único clic en el botón
o en el plato lo reintenta. El HTML local no puede concederse ese permiso.
Una interacción con el plato no anula el silencio elegido con el botón.
El parallax mueve los planos a distinta profundidad; la
preferencia de movimiento reducido lo desactiva, pero el carrusel continúa.

**PIDE LA CUENTA** es transparente y se ajusta al texto. Abre fecha, hora,
plataformas, minutos e importes, sin el desplegable de contenido registrado.
Se cierra con su botón, Escape o al pulsar fuera.

## Historial y descargas

Abre **Opciones** desde el menú del icono. La página usa Kode Mono, fondo blanco
y líneas finas, con el limón a la izquierda y el título a la derecha.
Las acciones se agrupan en filas junto al estado del historial.
Puedes servir la última sesión, reunir el historial, guardar JSON
o limpiar con confirmación. Limpiar requiere terminar la sesión activa y
no borra archivos descargados.

El historial habitual permanece dentro del navegador. Solo se exporta al
pedirlo; las copias JSON son compactas y conservan todos los datos.

```text
Descargas/Tracker/
  informes/    Platos de cada sesión
  historial/   HTML del historial completo
  datos/       Copias JSON
```

Los HTML se nombran `Plato Digital DD-MM-AAAA_HH-MM-SS.html`, por ejemplo,
`Plato Digital 05-11-2026_20-15-32.html`. Usan la fecha y hora local del final
de la comida; el historial completo usa la hora de exportación. Los guiones
son válidos en Windows. El navegador añade un sufijo si el nombre existe.

Una extensión no puede escribir directamente en la carpeta del proyecto.
Para copiar las descargas conservando su separación:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File herramientas/mantenimiento.ps1 -Informes
```

Se conservan los originales y no se sobrescriben archivos. Puedes añadir
`-Origen "D:\Mis descargas\Tracker"` para usar otra ubicación.

Un HTML descargado no se actualiza al cambiar el código. Recarga la extensión
y usa **Servir última sesión** para generar otro. Desinstalar elimina su
historial local; guarda una copia antes. No hay importador JSON.

No se envían datos a servidores. En correo y documentos solo se registra la
aplicación y su tiempo. Los títulos y enlaces se limitan a YouTube y Twitch,
sin duplicar contenido al pausarlo o volver a él.

## Carpetas y recursos

```text
extension/       Código, estilos, recursos preparados y pruebas
  assets/        Catálogo, medios, ASCII, fuente y licencia
landing/         Portada, página del camarero y ZIP de distribución
herramientas/    Mantenimiento, empaquetado y preparación de la web
.github/         Publicación automática en GitHub Pages
informes/        Ejemplo y platos guardados, solo locales
datos/           Copias personales del historial, solo locales
archivo/         Respaldo de los recursos originales, solo local
manifest.json    Compatibilidad con la instalación anterior
```

Los recursos activos están en `extension/assets/`: 60 vídeos y fotografías,
sus miniaturas y cinco fondos. Los vídeos mantienen su duración y las pistas
de sonido disponibles en sus originales, con un máximo de 640 × 420 y
15 fotogramas por segundo. Las pistas se normalizan para equilibrar el volumen
entre clips y se guardan en AAC estéreo. Los originales sin sonido permanecen en silencio.

Edita la propiedad `hashtags` de `extension/assets/catalogo.json` para cambiar
los textos de cada sabor. Contiene las 98 etiquetas indicadas: 23 saladas,
21 dulces, 20 amargas, 17 ácidas y 17 umami. Se usan en los textos flotantes
y al ampliar vídeos o fotos. Cada `id`, `taste` y `src` identifica un recurso;
recarga la extensión después de editar el catálogo.
Los originales están reunidos en `archivo/recursos-originales.zip`, verificado
por SHA256; la extensión no lo necesita para funcionar.

## Mantenimiento

La landing tiene una entrada `landing/main.scss` con imports de los parciales:

```text
landing/
  main.scss
  partials/
    _vars.scss         Colores y tipografía
    _base.scss         Reglas comunes
    _header.scss       Cabecera del camarero
    _camarero.scss     Contenido y pie del camarero
    _responsive.scss   Ajustes de ordenador y accesibilidad
    _intro.scss        Portada y animación de letras
    _devices.scss      Aviso para móviles y tablets
  styles.css           CSS compilado que cargan las páginas
```

En `_vars.scss`, `$salado` es cyan `#00F0FF`, `$dulce` magenta `#EB008B`
y `$acido` verde `#66FF00`; también se definen `$blanco`, `$negro` y Kode Mono.
Para regenerar los estilos y el ZIP:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File herramientas/mantenimiento.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File herramientas/empaquetar.ps1
```

El primer comando compila la landing con Dart Sass y sincroniza los estilos
de la extensión. Usa Sass si ya está instalado; si no, descarga la versión
portátil oficial en una carpeta temporal y la elimina al terminar. Esa compilación
necesita conexión si no tienes Sass. El CSS ya generado permite usar la web sin instalar nada.
El segundo comando prepara el ZIP en una carpeta temporal fuera del proyecto.

Para preparar localmente la misma carpeta que publicará GitHub Pages, con
Node.js 22 o posterior:

```powershell
node herramientas/preparar-web.mjs
node herramientas/verificar-proyecto.mjs --web
```

La salida está en `.preview/site/`; contiene la portada en su raíz, el camarero,
los recursos públicos y el ZIP recién generado. El verificador comprueba rutas,
catálogo, estilos y cada archivo del ZIP frente a su fuente. En Windows se usa
PowerShell para comprimir; en Linux se necesita `zip`, ya incluido en el entorno
de GitHub Actions. Si editas SCSS, regenera primero los estilos con mantenimiento.
El flujo de GitHub realiza ambos pasos automáticamente.

Para desarrollo, con Node.js:

```powershell
node herramientas/generar-ejemplo.mjs
node herramientas/verificar-proyecto.mjs
node extension/pruebas/tests-clock.mjs
node extension/pruebas/tests-browser.mjs --root
```

La prueba de navegador usa Chrome con un perfil temporal y su política normal
de reproducción automática, sin tocar el perfil personal. Comprueba también
que un único clic permite activar el audio cuando el navegador lo bloquea.
La lógica también se comprueba abriendo `extension/pruebas/tests.html`
desde la extensión. Las salidas de pruebas aparecen en `.preview/` y se pueden
borrar. Node.js no es necesario para instalar ni usar la extensión.

La revisión previa a GitHub comprobó el reloj en ambas formas de instalación,
las 99 pruebas de lógica y el recorrido completo en Chrome: iniciar, terminar,
descargar, volver a exportar y limpiar. La web preparada también se probó por
HTTP bajo `/buffet-visual/`, con descarga real del ZIP, escritorio, avisos de
móvil y tablet, GSAP y máquina de escribir. El despliegue en GitHub se realizará
cuando subáis el repositorio y activéis Pages.
