# Changelog

All notable changes to CyberViewer are documented here.

## [1.23.2] - 2026-11-17

### 🇺🇸 English

- Keep video playback when a pan drag is released, hold the pause badge while the player idles, and keep the play confirmation visible twice as long.
- Generate seek-preview thumbnails less often, settle them only for QHD and 4K videos, and hide stale thumbnails while a high-quality sweep moves.
- Show an icon-only volume control when a video has no audio, and clarify the hint as a video without audio.
- Drop the duplicated up-to-date note under the About check button and soften its hover with the standard accent.
- Ship winget manifests with every release and automate Windows Package Manager submissions.

### 🇪🇸 Español

- La reproducción de vídeo continúa al soltar un arrastre de paneo, la insignia de pausa se sostiene mientras el reproductor está inactivo y la confirmación de reproducción se ve el doble de tiempo.
- Genera las miniaturas de avance con menos frecuencia, las estabiliza solo en vídeos QHD y 4K y oculta las miniaturas obsoletas mientras avanza un barrido de alta calidad.
- Muestra un control de volumen de solo icono cuando un vídeo no tiene audio, y aclara el aviso como un vídeo sin audio.
- Elimina la nota duplicada bajo el botón de comprobación de Acerca de y suaviza su hover con el acento estándar.
- Publica manifiestos winget con cada release y automatiza los envíos al Windows Package Manager.

## [1.23.1] - 2026-11-16

### 🇺🇸 English

- Fixed in-app update installs racing pending unsaved changes: choosing "Restart and update" (from the update popup or the About dialog) now shows the same discard warning as closing the app, and the installer only runs after the warning is resolved. Cancelling leaves the app and the pending update untouched, and discarding flushes the session, then quits and installs cleanly, so the NSIS error "Fallo al desinstalar archivos antiguos de la aplicación" can no longer appear when rotations or pasted images are pending.
- The update popup no longer rebuilds its whole subtree on every download-progress tick: progress patches the percentage and the bar in place, so the Dismiss button no longer flickers at high speed under the cursor while a download runs, and the bar's width transition animates again.
- Download progress broadcasts are coalesced to whole-percent changes plus a 500ms keepalive, cutting per-chunk IPC traffic between the main process and the renderer.

### 🇪🇸 Español

- Corregidas las instalaciones de actualización integradas que competían con cambios sin guardar: al elegir "Reiniciar y actualizar" (desde el popup de actualización o desde el Acerca de) se muestra ahora el mismo aviso de descarte que al cerrar la app, y el instalador solo se ejecuta cuando el aviso queda resuelto. Cancelar deja la app y la actualización pendiente intactas, y descartar vuelca la sesión, luego sale e instala limpiamente, así que el error NSIS "Fallo al desinstalar archivos antiguos de la aplicación" ya no puede aparecer con rotaciones o imágenes pegadas pendientes.
- El popup de actualización ya no reconstruye todo su subárbol en cada tick de progreso de descarga: el progreso actualiza el porcentaje y la barra en sitio, así que el botón Descartar ya no parpadea a alta velocidad bajo el cursor durante una descarga y la transición de ancho de la barra vuelve a animarse.
- Los broadcasts de progreso de descarga se coalescen a cambios de porcentaje entero más un keepalive de 500ms, reduciendo el tráfico de IPC por chunk entre el proceso principal y el renderer.

## [1.23.0] - 2026-11-15

### 🇺🇸 English

- Dedicated invalid-file view: when a file is missing or unreadable, a refined error banner owns the canvas. The action bar and statusbar hide, the sidebar toggle is disabled while the tab is broken, banner buttons use the app action color with "Locate file" listed before "Open another image", and pan, zoom and double-click gestures no longer respond to nothing.
- Welcome screen polish: a "YouTube link" entry (Ctrl+L) opens the YouTube dialog without any file, the format list becomes a flyout on the drop icon showing the About-style badge chips, the sidebar toggle hides with no files open, Paste is relabeled "Paste image", and the primary button stacks above the secondary pair.
- YouTube URL paste: the Paste button relabels itself to "Paste YouTube URL" when the clipboard holds a YouTube link (re-probed on window focus), and Ctrl+V opens it too. Wording is unified to "YouTube link", the dedicated button hides while paste is in link mode, and the close warning now reflects only what is actually pending (rotations, images never saved, or both) in singular or plural.
- View-mode HUD: a new mode HUD surfaces view-mode feedback (Fit, 1:1, fullscreen zoom) and now carries copy, favorite, rotation and save success feedback instead of toasts over the image. Floating chrome (topbar, statusbar, action bar, filename banner, nav arrows and HUDs) hides behind dialogs, content hotkeys are blocked while a dialog is open, the sidebar hides for pasted images, toasts stay readable above dialogs, and the modal flag self-heals from every overlay.
- A running slideshow pauses while a dialog is open and resumes when the last dialog closes; a manual pause is respected.
- Fixed image paste broken by the Electron 45 clipboard API change: the probe feature-detects both eras and reads images through async clipboard items. Copy-image is repaired, shortcut hints are unified and helper text sizes are bumped.
- Legibility polish: the dialog focus ring becomes a single dimmed border with a soft halo, secondary text is lifted across the dark and gray themes (helper texts, confirm details, menu hints) and dim tray texts are raised.
- Windows uninstall registry metadata now includes the website URL and consistent English comments.
- Runtime updates: Electron 45.3.0, electron-updater 6.8.11 and music-metadata 12.4.0.

### 🇪🇸 Español

- Vista dedicada de archivo inválido: cuando un archivo falta o no se puede leer, un banner de error refinado toma el lienzo. La barra de acciones y la de estado se ocultan, el toggle de la barra lateral se desactiva mientras la pestaña esté rota, los botones del banner usan el color de acción de la app con "Localizar archivo" antes de "Abrir otra imagen", y los gestos de paneo, zoom y doble clic ya no responden a nada.
- Pulido de la pantalla de bienvenida: una entrada "Enlace de YouTube" (Ctrl+L) abre el diálogo de YouTube sin necesidad de archivos, la lista de formatos se convierte en un flyout sobre el icono de soltar con las insignias del Acerca de, el toggle de la barra lateral se oculta sin archivos abiertos, Pegar pasa a llamarse "Pegar imagen" y el botón principal se apila sobre la pareja secundaria.
- Pegado de URLs de YouTube: el botón Pegar se renombra a "Pegar URL de YouTube" cuando el portapapeles contiene un enlace de YouTube (recomprobado al enfocar la ventana), y Ctrl+V también lo abre. El texto se unifica como "Enlace de YouTube", el botón dedicado se oculta mientras pegar está en modo enlace y el aviso de cierre refleja solo lo que está pendiente de verdad (rotaciones, imágenes sin guardar, o ambas) en singular o plural.
- HUD de modo de vista: un nuevo HUD muestra el feedback de los modos de vista (Ajustar, 1:1, zoom en pantalla completa) y ahora recoge el feedback de copiar, favoritar, rotar y guardar en lugar de toasts sobre la imagen. El chrome flotante (barra superior, de estado, de acciones, banner de nombre, flechas y HUDs) se oculta tras los diálogos, los atajos de contenido se bloquean con un diálogo abierto, la barra lateral se oculta para imágenes pegadas, los toasts siguen legibles sobre los diálogos y la bandera de modal se auto-repara desde cada overlay.
- Una presentación en curso se pausa mientras haya un diálogo abierto y se reanuda al cerrar el último; una pausa manual se respeta.
- Corregido el pegado de imágenes roto por el cambio de API del portapapeles en Electron 45: la comprobación detecta ambas eras y lee las imágenes mediante items asíncronos del portapapeles. Copiar imagen queda reparado, las pistas de atajos se unifican y los tamaños del texto de ayuda suben.
- Pulido de legibilidad: el anillo de foco de los diálogos pasa a un borde atenuado con halo suave, el texto secundario sube contraste en los temas oscuro y gris (textos de ayuda, detalles de confirmación, pistas de menús) y los textos atenuados de la bandeja se levantan.
- Los metadatos de desinstalación del registro de Windows incluyen ahora la URL de la web y comentarios en inglés consistentes.
- Actualizaciones de runtime: Electron 45.3.0, electron-updater 6.8.11 y music-metadata 12.4.0.

## [1.22.0] - 2026-11-13

### 🇺🇸 English

- Suite-standard tray popup: right-click the tray icon for an anchored card with a live status row, show/hide with the shortcut badge, an open-file action, help links, and other CyberGems apps.
- Recent files in the tray with real thumbnails, a full list view for up to ten files, and a clear-list action.
- "CyberGems Suggestions" setting that hides suite recommendations in the tray menu and in the About dialog.
- App-style tooltip bubbles in the tray menu, showing the full path of recent files.
- The exit and donate icons keep their red color on hover, and the website link uses the suite diamond glyph.
- Checking for updates in development or portable builds now shows an informational hint pointing to GitHub Releases instead of a failure message.
- The hidden tray popup no longer keeps the process alive after the main window is really closed.

### 🇪🇸 Español

- Popup estándar de la suite: clic derecho en el icono de la bandeja abre una tarjeta anclada con una fila de estado en vivo, mostrar u ocultar con la insignia del atajo, acción de abrir archivos, enlaces de ayuda y otras apps de CyberGems.
- Archivos recientes en la bandeja con miniaturas reales, una vista de lista completa de hasta diez archivos y una acción para limpiar la lista.
- Ajuste "Sugerencias de CyberGems" que oculta las recomendaciones de la suite en el menú de la bandeja y en el diálogo Acerca de.
- Burbujas de tooltip al estilo de la app en el menú de la bandeja, mostrando la ruta completa de los archivos recientes.
- Los iconos de salir y donar mantienen su color rojo en hover, y el enlace de la web usa el glifo de diamante de la suite.
- Buscar actualizaciones en builds de desarrollo o portable muestra ahora un aviso informativo que apunta a GitHub Releases en lugar de un mensaje de error.
- El popup oculto de la bandeja ya no mantiene el proceso vivo después de cerrar de verdad la ventana principal.

## [1.21.1] - 2026-11-06

### 🇺🇸 English

- Native local audio playback for MP3, WAV, FLAC, Ogg, Opus, and AAC files, with shared media controls, saved playback preferences, and reactive audio visualizations.
- Media properties for images, videos, audio, and YouTube: useful metadata, local video frame previews, YouTube thumbnails and playlist position and total when available, plus concise copy actions.
- Optional media type icons in tabs, a searchable tab list with matching icons, playlist link copying, and clearer YouTube playlist position details.
- Settings for remembering playback state across tabs and choosing whether center drops replace the current tab or open new tabs; dropping directly on the tab strip opens at that position.
- Tab, settings, properties, and modal controls share a more consistent CyberViewer visual style, with clearer labels, metadata hierarchy, and localized tooltips.
- Images now open at 1:1 when they fit the viewport and scale down only when necessary.
- YouTube playlist titles keep a single color style, thumbnails load in properties, and context menus remain visible above embedded playback.
- Media paused and playing states restore predictably when switching tabs or relaunching the app, and media stays paused after session restore until playback is explicitly started.
- Restored windows no longer reactivate the minimize button hover until the pointer moves, and dragging files over YouTube embeds is accepted.
- Crop controls and confirmation actions have more consistent spacing and hover behavior.

### 🇪🇸 Español

- Reproducción nativa de audio local para archivos MP3, WAV, FLAC, Ogg, Opus y AAC, con controles de medios compartidos, preferencias de reproducción guardadas y visualizaciones reactivas.
- Propiedades de medios para imágenes, videos, audio y YouTube: metadatos útiles, vistas previas de fotogramas de video local, miniaturas de YouTube y posición y total de la playlist cuando están disponibles, con acciones de copia concisas.
- Iconos opcionales de tipo de medio en las pestañas, lista de pestañas buscable con iconos, copia del enlace de la playlist y detalles de posición de la playlist de YouTube más claros.
- Ajustes para recordar el estado de reproducción entre pestañas y elegir si los archivos soltados en el centro reemplazan la pestaña actual o abren una nueva; soltar directamente sobre la barra de pestañas abre en esa posición.
- Los controles de pestañas, ajustes, propiedades y modales comparten un estilo visual CyberViewer más coherente, con etiquetas claras, jerarquía de metadatos y tooltips localizados.
- Las imágenes se abren a 1:1 cuando caben en la ventana y solo se reducen cuando es necesario.
- Los títulos de las playlists de YouTube mantienen un solo estilo de color, las miniaturas cargan en propiedades y los menús contextuales siguen visibles sobre la reproducción incrustada.
- Los estados de pausa y reproducción se restauran de forma predecible al cambiar de pestaña o reiniciar la app, y los medios quedan en pausa tras restaurar la sesión hasta que se inicia la reproducción de forma explícita.
- Las ventanas restauradas ya no reactivan el hover del botón de minimizar hasta mover el puntero, y el arrastre de archivos sobre los embeds de YouTube se acepta.
- Los controles de recorte y las acciones de confirmación tienen un espaciado y un hover más coherentes.

## [1.20.0] - 2026-10-31

### 🇺🇸 English

- YouTube-style video playback: an overlay flash on play/pause, previous and next video buttons driven by the folder contents, click-to-pause on the video with double-click fullscreen, a persistent speed panel (0.25× to 3× with display, slider and presets, plus > / < shortcuts), and a seek-bar hover preview with timestamp and frame thumbnail.
- A video shortcut sheet in the shortcuts popover.
- Tab bar overhaul: double-clicking the empty strip opens files, the strip has its own context menu (reopen closed tab, close all), a working "+" button with the suite look, edge navigation buttons that appear only while the tabs overflow, and a richer switcher with header, live count and close-all.
- A video default-viewer option in the installer and a read-only file association panel in the System tab: the current viewer per supported format, read live from the registry, with a shortcut to the Windows settings.
- Video playback preferences now persist across sessions: loop, volume and mute join speed and autoplay, and the speed buttons support press-and-hold to repeat while the video menu is open.
- The video More menu follows the suite language: an icon on every row, app-style toggles for autoplay and loop, a themed hover and neutral separators; the old context menus share the same subtle hover and sober separators, and the tab bar buttons match the suite look.
- Transport tooltips render above the controls, and the titlebar gains a top hairline, a restore-default hotkey button next to Clear, and filename text that keeps descenders visible.
- The video speed slider is now a fully controlled pointer-driven track with 0.05 snapping: the thumb and the fill always move together, dragging beyond the edges clamps, and custom values no longer snap back.
- Windows no longer reopen wider than the screen after mixed-DPI inflation: the inflated size is corrected while the window settles and can no longer be persisted.
- Quitting from the tray works with the About or configuration dialogs open, and the ghost tooltip and hover no longer resurface on the minimize button after restoring from the taskbar.
- The tab bar "+" button opens the file dialog again, the confirm dialog keeps the paused video frame recognizable, and the empty canvas no longer shows a grab cursor.

### 🇪🇸 Español

- Reproducción de video estilo YouTube: destello del overlay en play/pausa, botones de video anterior y siguiente según la carpeta, clic sobre el video para pausar con doble clic a pantalla completa, panel de velocidad persistente (0.25× a 3× con display, slider y presets, más atajos > / <) y vista previa en la barra de progreso con marca de tiempo y miniatura del fotograma.
- Hoja de atajos de video en el popover de atajos.
- Barra de pestañas renovada: doble clic en la franja vacía abre archivos, menú contextual propio (reabrir pestaña cerrada, cerrar todas), botón "+" funcional con el estilo de la suite, botones de navegación en los extremos solo cuando las pestañas desbordan y un switcher con encabezado, contador en vivo y cierre total.
- Opción de reproductor de video predeterminado en el instalador y panel de asociaciones de archivos de solo lectura en la pestaña Sistema: el visor actual por formato compatible, leído del registro en vivo, con acceso directo a los ajustes de Windows.
- Las preferencias de reproducción de video persisten ahora entre sesiones: repetir, volumen y silencio se suman a velocidad y autoplay, y los botones de velocidad se pueden mantener pulsados para repetir mientras el menú de video está abierto.
- El menú Más del video sigue el lenguaje de la suite: un icono en cada fila, toggles al estilo de la app para autoplay y repetir, hover temático y separadores neutros; los antiguos menús contextuales comparten el mismo hover sutil y separadores sobrios, y los botones de la barra de pestañas igualan el estilo de la suite.
- Los tooltips de transporte se muestran sobre los controles, y la barra de título estrena una línea superior, un botón de restaurar atajo por defecto junto a Limpiar y texto del nombre de archivo que mantiene visibles los descendentes.
- El slider de velocidad es ahora una pista controlada por puntero con ajuste de 0.05: el pulgar y el relleno se mueven siempre juntos, arrastrar más allá de los extremos se limita y los valores personalizados ya no vuelven atrás.
- Las ventanas ya no se reabren más anchas que la pantalla tras la inflación de DPI mixto: el tamaño inflado se corrige mientras la ventana se asienta y ya no puede guardarse.
- Salir desde la bandeja funciona con los diálogos Acerca de o de configuración abiertos, y el tooltip fantasma y el hover ya no reaparecen en el botón de minimizar tras restaurar desde la barra de tareas.
- El botón "+" de la barra de pestañas vuelve a abrir el diálogo de archivos, el diálogo de confirmación mantiene reconocible el fotograma pausado y el lienzo vacío ya no muestra cursor de agarre.

## [1.19.1] - 2026-10-31

### 🇺🇸 English

- Fixed in-app update installs that could fail with the NSIS error "Fallo al desinstalar archivos antiguos de la aplicación" when closing to the tray was enabled: the updater's quit was intercepted and hidden to the tray instead of exiting, leaving the old executable locked while the new installer ran. Every quit now lands on the first attempt, so updating from the About dialog completes cleanly.
- Release builds now submit the installer and portable binaries to VirusTotal automatically, so the SHA256 report links in the release body resolve as soon as a release is published.

### 🇪🇸 Español

- Corregidas las actualizaciones integradas que podían fallar con el error NSIS "Fallo al desinstalar archivos antiguos de la aplicación" al tener activado cerrar a la bandeja: la salida del actualizador se interceptaba y ocultaba a la bandeja en lugar de salir, dejando el ejecutable antiguo bloqueado mientras corría el nuevo instalador. Cada cierre ahora funciona al primer intento, así que actualizar desde el Acerca de completa limpiamente.
- Las builds de release suben ahora el instalador y el portable a VirusTotal automáticamente, así que los enlaces de informe SHA256 del cuerpo del release resuelven en cuanto se publica una versión.

## [1.19.0] - 2026-10-31

### 🇺🇸 English

- Appearance themes: CyberViewer (default dark with the chosen accent), Gray (a sober grayscale palette that neutralises every chromatic accent), and Light (light surfaces that keep the accent, with darkened accent text for contrast). Pick one on the Appearance tab; the choice is saved, included in backups, and applied before the first frame so the window does not flash.
- A dismissible update popup in the main window on the CyberFeeds pattern: a language-aware changelog peek when a new version is available, download progress and restart actions, and a per-version skip that is remembered in settings. A console command previews every update state for testing.
- A theme-following automatic transparency background: light theme users get the light checkerboard by default (existing dark defaults migrate once), explicit choices are respected, and the View menu toggle still overrides it.
- Interface colours come from a shared token layer, so every theme repaints the chrome, menus, modals and canvas consistently instead of relying on hardcoded dark values.
- The Light theme is tuned per accent: text uses hand-picked ink tones per swatch, menus, the video player menu and the shortcuts popover get a white frost instead of the dark glass, and the titlebar branding keeps its contrast.
- Every switch follows the suite toggle pattern: a dark thumb at rest and an accent track with a white check when on, with graphite and light variants per theme.
- The About modal was refined: language-aware format badges now include video support, the tagline mentions videos, the updates section opens with a green status pill and version chips joined by a transition arrow, the release link reads as a secondary button, the auto-check toggle closes the section, and scrolling fades at the edges. Update check feedback mirrors in the About formats box, so checking, up-to-date and error states are visible at the top of the modal without scrolling.
- Fixed quitting from the tray menu while the window was hidden only restoring the window on the first attempt: explicit quits are no longer cancelled, the acknowledged close retries the quit until it lands, a watchdog restores normal close semantics if the renderer's close chain never completes, and chrome-only dialogs such as the configuration panel no longer count as work in progress.
- Windows center correctly on mixed-DPI multi-monitor setups: startup bounds are re-asserted after the window is shown, and the maximize nudge can no longer exceed the target work area.
- The welcome drop frame is square so its corner brackets align, the titlebar divider reads as a crisp 1px line without glow, and the grab cursor no longer appears over the empty canvas.
- The default CyberViewer theme keeps the previous palette and accent behaviour unchanged.

### 🇪🇸 Español

- Temas de apariencia: CyberViewer (oscuro por defecto con el acento elegido), Gris (una paleta de grises sobria que neutraliza cada acento cromático) y Claro (superficies claras que mantienen el acento, con texto de acento oscurecido para contraste). Se eligen en la pestaña Apariencia; la elección se guarda, entra en los respaldos y se aplica antes del primer fotograma para que la ventana no parpadee.
- Popup de actualización descartable en la ventana principal siguiendo el patrón CyberFeeds: un vistazo al changelog según el idioma cuando hay una versión nueva, progreso de descarga y acción de reinicio, y una omisión por versión que se recuerda en los ajustes. Un comando de consola previsualiza cada estado de actualización para pruebas.
- Fondo de transparencia automático que sigue al tema: los usuarios del tema Claro reciben el cuadriculado claro por defecto (los valores oscuros existentes migran una vez), las elecciones explícitas se respetan y el toggle del menú Ver sigue teniendo prioridad.
- Los colores de la interfaz salen de una capa de tokens compartida, así cada tema repinta chrome, menús, modales y lienzo de forma consistente en lugar de depender de valores oscuros fijados en el código.
- El tema Claro se ajusta por acento: el texto usa tonos de tinta elegidos a mano por color, los menús, el menú del reproductor de video y el popover de atajos usan escarcha blanca en lugar del vidrio oscuro, y la marca de la barra de título conserva su contraste.
- Cada interruptor sigue el patrón toggle de la suite: pulgar oscuro en reposo y pista de acento con marca blanca al activar, con variantes grafito y clara por tema.
- El modal Acerca de quedó refinado: las insignias de formatos según idioma ahora incluyen soporte de video, la etiqueta menciona videos, la sección de actualizaciones abre con una pastilla verde de estado y chips de versión unidos por una flecha de transición, el enlace del release se lee como botón secundario, el toggle de comprobación automática cierra la sección y el scroll se desvanece en los bordes. El feedback de la búsqueda de actualizaciones se refleja en el cuadro de formatos del Acerca de, así los estados de comprobando, al día y error se ven en la parte superior del modal sin hacer scroll.
- Corregido el salir desde el menú de la bandeja con la ventana oculta, que solo restauraba la ventana al primer intento: las salidas explícitas ya no se cancelan, el cierre reconocido reintenta la salida hasta que funciona, un vigía restaura la semántica de cierre normal si la cadena de cierre del renderer nunca termina y los diálogos de solo chrome como el panel de configuración ya no cuentan como trabajo en curso.
- Las ventanas se centran correctamente en configuraciones mixtas de DPI multi-monitor: los límites de inicio se reafirman tras mostrar la ventana y el empujón de maximizado ya no puede exceder el área de trabajo objetivo.
- El marco de bienvenida para soltar es cuadrado para que sus brackets de esquina se alineen, el divisor de la barra de título se lee como una línea nítida de 1px sin brillo y el cursor de agarre ya no aparece sobre el lienzo vacío.
- El tema CyberViewer por defecto mantiene la paleta y el comportamiento de acento anteriores sin cambios.

## [1.18.0] - 2026-10-30

### 🇺🇸 English

- Integrated video playback in lightweight media tabs with MP4, M4V, WebM, MOV and Matroska (MKV) support, matching Windows file associations, refined controls, immersive fullscreen, and reliable Matroska initialization.
- Isolated YouTube video and playlist playback in a dedicated viewer.
- Image tabs with optional session restore across launches.
- Scheduled automatic backups with safety restore, enabled by default, plus a resident tray icon.
- Set the Windows desktop wallpaper directly from pasted or dropped in-memory images.
- First-close dialog to choose between the tray and quitting, with a softer titlebar divider.
- Hotkey badges on every titlebar control, unified and enlarged across all dialogs.
- Redesigned About modal on the CyberFeeds pattern, with a diagnostics copy button; About icons are synchronized from official suite repositories before release builds.
- Redesigned welcome banner icon as a drop-into-tray glyph that opens the file dialog, with the supported format list grouped by media type.
- New brand app icon and branded NSIS installer artwork with strict warnings restored.
- Sidebar starts closed on manual launches and collapses when images are opened externally.
- Reduced tray branding logo desaturation to 50% while idle and polished the tray visibility reminder.
- Window lifecycle diagnostics and a compositor frame nudge improve visibility after Windows auto-start.
- Normalized the license to GPL-3.0-only with the canonical GPL-3.0 text and added a Spanish README.
- Fixed window centering on monitors with a different scale factor: bounds are re-applied until they match at startup, before maximizing onto the target display, and after unmaximize, fixing mixed-DPI multi-monitor placement.

### 🇪🇸 Español

- Reproducción de video integrada en pestañas de medios ligeras con soporte para MP4, M4V, WebM, MOV y Matroska (MKV), asociaciones de archivos de Windows coincidentes, controles refinados, pantalla completa inmersiva e inicialización de Matroska fiable.
- Reproducción aislada de videos y playlists de YouTube en un visor dedicado.
- Pestañas de imágenes con restauración opcional de la sesión entre lanzamientos.
- Respaldos automáticos programados con restauración de seguridad, activados por defecto, más un icono de bandeja residente.
- Establece el fondo de pantalla de Windows directamente desde imágenes pegadas o soltadas en memoria.
- Diálogo de primer cierre para elegir entre la bandeja y salir, con un divisor de barra de título más suave.
- Insignias de atajos en cada control de la barra de título, unificadas y ampliadas en todos los diálogos.
- Modal Acerca de rediseñado con el patrón CyberFeeds y botón para copiar diagnósticos; los iconos del Acerca de se sincronizan desde los repositorios oficiales de la suite antes de las builds de release.
- Icono del banner de bienvenida rediseñado como glifo de soltar en la bandeja que abre el diálogo de archivos, con la lista de formatos compatibles agrupada por tipo de medio.
- Nuevo icono de marca de la app e instalador NSIS con arte de marca y avisos estrictos restaurados.
- La barra lateral inicia cerrada en lanzamientos manuales y se contrae al abrir imágenes desde fuera de la app.
- Desaturación del logo de marca en la bandeja reducida al 50% en reposo y recordatorio de visibilidad de la bandeja pulido.
- Diagnósticos del ciclo de vida de la ventana y un impulso de fotograma del compositor mejoran la visibilidad tras el autoinicio de Windows.
- Licencia normalizada a GPL-3.0-only con el texto canónico GPL-3.0 y README en español añadido.
- Corregido el centrado de ventanas en monitores con factor de escala distinto: los límites se reaplican hasta coincidir al iniciar, antes de maximizar en la pantalla objetivo y tras desmaximizar, arreglando la ubicación en configuraciones mixtas de DPI multi-monitor.

## [1.17.0] - 2026-09-12

### 🇺🇸 English

- Set an image as the Windows desktop wallpaper directly from the viewer, with Fill, Fit, Center and Span options in the main and image context menus.
- Dedicated Favorites menu to add or remove the current image and open or close the Favorites gallery.
- Reopen up to 10 recent images from the system tray, with settings to toggle the submenu or clear the recent list.
- Context menus show contextual titles, preserve filename extensions when truncating long names, and gain a close-image action on the canvas.
- Expanded two-column keyboard shortcut guide with clearer labels, and no overlapping button tooltip while it is open.
- Refined welcome banner with a subtle drop indicator, larger bottom toolbar icons and a clock icon for tray recents; constrained context-menu widths and corrected sidebar tooltip presentation; new menu actions, wallpaper styles and tray settings include English and Spanish translations.
- Expandable update button in the title bar, with About update actions moved above the changelog preview.

### 🇪🇸 Español

- Establece una imagen como fondo de pantalla de Windows directamente desde el visor, con opciones Rellenar, Ajustar, Centrar y Extender en los menús contextuales principal y de imagen.
- Menú Favoritos dedicado para añadir o quitar la imagen actual y abrir o cerrar la galería de favoritos.
- Reabre hasta 10 imágenes recientes desde la bandeja del sistema, con ajustes para activar o desactivar el submenú o limpiar la lista de recientes.
- Los menús contextuales muestran títulos contextuales, conservan la extensión del archivo al acortar nombres largos y estrenan una acción de cerrar imagen en el lienzo.
- Guía de atajos de teclado ampliada a dos columnas con etiquetas más claras y sin tooltip de botón superpuesto mientras está abierta.
- Banner de bienvenida refinado con un indicador de arrastre sutil, iconos más grandes en la barra de herramientas inferior e icono de reloj para los recientes de la bandeja; anchos de menú contextual limitados y presentación de tooltips de la barra lateral corregida; las nuevas acciones de menú, estilos de fondo de pantalla y ajustes de bandeja incluyen traducciones al inglés y al español.
- Botón de actualización desplegable en la barra de título, con las acciones de actualización del Acerca de movidas encima de la vista previa del changelog.

## [1.16.0] - 2026-09-12

### 🇺🇸 English

- Redesigned modern sidebar: balanced 132px panel with comfortable 64px thumbnail cards and legible folder names, cyberpunk thumbnail cards with refined opacity, hover elevation and neon accent bars, animated GIF micro-badges, subtle gradient boundary dividers, and a glass folder header with an amber-glow Favorites toggle and instant full-path tooltips.
- Unified navigation dock: the Start, Locate/Center and End actions live in an embedded pill dock alongside a radiant HUD image counter.
- Native OS Shell thumbnails: Windows Shell thumbnail extraction and embedded EXIF previews avoid decompressing large 4K/8K images into RAM.
- Faster scanning: debounced background cache eviction replaces synchronous per-file scans, and a parallel worker pool processes up to 3 concurrent items, keeping scrolling and canvas interactions smooth even in folders with hundreds of wallpapers.
- Smart folder scan caching: folder signatures hydrate cached thumbnails instantly when returning to previously scanned directories (up to 30 folders), and closing the thumbnail sidebar freezes progress instead of resetting it, with fully cached folders bypassing rescans.
- Dynamic progress tracking reaches 100% accurately when thumbnails load asynchronously or fail, and pasting images from the clipboard (Ctrl+V) synchronizes the session state instantly.
- Window chrome refinements: unified title bar action geometries, refined divider thickness, file extensions kept visible in the window title, four new accent colors, distinct icons for fullscreen and slideshow modes, and an accessible compact keyboard shortcuts guide popover.

### 🇪🇸 Español

- Barra lateral moderna rediseñada: panel equilibrado de 132px con tarjetas de miniaturas de 64px cómodas y nombres de carpeta legibles, tarjetas cyberpunk con opacidad refinada, elevación al hover y barras de acento neón, micro-insignias para GIF animados, divisores de gradiente sutiles y encabezado de carpeta de vidrio con toggle de Favoritos con brillo ámbar y tooltips de ruta completa al instante.
- Dock de navegación unificado: las acciones Inicio, Localizar/Centrar y Fin viven en un dock de píldora integrado junto a un contador HUD de imagen radiante.
- Miniaturas nativas del Shell de Windows: la extracción de miniaturas del sistema y las vistas previas EXIF incrustadas evitan descomprimir imágenes 4K/8K en RAM.
- Escaneo más rápido: la expulsión de caché en segundo plano con debounce sustituye los escaneos síncronos por archivo, y un pool de workers paralelo procesa hasta 3 elementos concurrentes, manteniendo fluidos el scroll y el lienzo incluso en carpetas con cientos de fondos.
- Caché inteligente de escaneo de carpetas: las firmas de carpeta hidratan las miniaturas al instante al volver a directorios ya escaneados (hasta 30 carpetas), y cerrar la barra lateral de miniaturas congela el progreso en lugar de reiniciarlo, con las carpetas totalmente en caché saltándose el reescaneo.
- El seguimiento dinámico de progreso llega a 100% con precisión cuando las miniaturas cargan de forma asíncrona o fallan, y pegar imágenes del portapapeles (Ctrl+V) sincroniza la sesión al instante.
- Refinamientos del chrome de ventana: geometrías unificadas de las acciones de la barra de título, grosor del divisor refinado, extensiones de archivo visibles en el título de la ventana, cuatro colores de acento nuevos, iconos distintivos para pantalla completa y presentación y un popover compacto y accesible de guía de atajos.

## [1.15.0] - 2026-09-11

### 🇺🇸 English

- AVIF support across Open dialogs, Explorer launching, drag-and-drop, thumbnails, MIME handling and Windows file associations.
- The adjustment modal becomes a right-side drawer that previews changes directly on the main image, with a live-preview toggle, momentary A/B comparison, refined adjustment controls and reset behavior, and the option to apply edits to a copy.
- Title-bar Help menu with a dedicated Configuration shortcut and quick access to documentation, updates and tray guidance.
- New Backup & Data settings tab grouping backup import/export and recovery controls, with actions to open the data folder, clear the thumbnail cache and clear recent history.
- Guidance for keeping the tray icon visible, including a Windows taskbar-settings helper and optional reminders.
- Configuration becomes a sliding side panel without horizontal overflow, with an About footer showing the app version; translucent glass styling on floating menus and the adjustment drawer, menu flyouts rendered outside composited parents so backdrop blur works correctly, and unified toolbar SVG geometry with softer action styling.
- Stabilized tray-menu reopening, positioning and click handling, with native tray flyouts and icons restored; browser-based AVIF thumbnail handling with format-specific cache keys.

### 🇪🇸 Español

- Soporte AVIF en los diálogos Abrir, el lanzamiento desde Explorer, arrastrar y soltar, miniaturas, manejo MIME y asociaciones de archivos de Windows.
- El modal de ajustes se convierte en un cajón lateral derecho que previsualiza los cambios directamente sobre la imagen principal, con toggle de vista previa en vivo, comparación A/B momentánea, controles de ajuste y comportamiento de reinicio refinados, y la opción de aplicar las ediciones a una copia.
- Menú Ayuda en la barra de título con un atajo dedicado a Configuración y acceso rápido a documentación, actualizaciones y guía de la bandeja.
- Nueva pestaña de ajustes Respaldo y datos que agrupa la importación/exportación de respaldos y los controles de recuperación, con acciones para abrir la carpeta de datos, limpiar la caché de miniaturas y limpiar el historial de recientes.
- Guía para mantener visible el icono de la bandeja, con un asistente de los ajustes de la barra de tareas de Windows y recordatorios opcionales.
- Configuración se convierte en un panel lateral deslizante sin desbordamiento horizontal, con un pie del Acerca de que muestra la versión de la app; estilo de vidrio translúcido en los menús flotantes y el cajón de ajustes, los flyouts de menú se renderizan fuera de los padres compuestos para que el blur de fondo funcione correctamente, y geometría SVG unificada en la barra de herramientas con acciones más suaves.
- Reapertura, posicionamiento y clics del menú de bandeja estabilizados, con flyouts e iconos nativos de bandeja restaurados; manejo de miniaturas AVIF en la capa de navegador con claves de caché por formato.

## [1.14.0] - 2026-09-10

### 🇺🇸 English

- The 1:1 view accounts for Windows display scaling, so captured widgets and screenshots can be inspected at their real physical size on mixed-DPI monitors.
- Complete .ico support: Open dialogs, Explorer double-click launching, drag-and-drop, previews and file associations.
- Image outlines are now optional and disabled by default, with a setting to enable them when needed.
- Increased minimum window width so toolbar hints and actions remain inside the window, and normal windows reopen centered on their last-used monitor, including mixed-DPI multi-monitor setups.
- Release metadata and notes join the in-app update experience, with improved update status handling, release-note retrieval, release-page access and an explicit installation flow; silent NSIS installation behavior is preserved while automatic download and installation stay under user control.
- Tactile feedback micro-animations across buttons and modal actions, refined About footer, donation tooltip alignment, iconography and logo glow timing, with continued English/Spanish coverage.

### 🇪🇸 Español

- La vista 1:1 tiene en cuenta el escalado de pantalla de Windows, así los widgets capturados y las capturas se inspeccionan a su tamaño físico real en monitores de DPI mixto.
- Soporte completo de .ico: diálogos Abrir, lanzamiento con doble clic desde Explorer, arrastrar y soltar, vistas previas y asociaciones de archivos.
- Los contornos de imagen son ahora opcionales y vienen desactivados por defecto, con un ajuste para activarlos cuando haga falta.
- Ancho mínimo de ventana ampliado para que las pistas y acciones de la barra de herramientas queden dentro de la ventana, y las ventanas normales se reabren centradas en su último monitor usado, incluidas configuraciones de DPI mixto multi-monitor.
- Los metadatos y las notas del release llegan a la experiencia de actualización integrada, con mejor manejo del estado de actualización, recuperación de notas, acceso a la página del release y un flujo de instalación explícito; el comportamiento silencioso de la instalación NSIS se conserva mientras la descarga e instalación automáticas siguen bajo control del usuario.
- Micro-animaciones de feedback táctil en botones y acciones de modales, pie del Acerca de refinado, alineación del tooltip de donación, iconografía y temporización del brillo del logo, con cobertura continua en inglés y español.

## [1.13.0] - 2026-08-27

### 🇺🇸 English

- Updated app icon with a fresh look across the title bar, tray and About dialog, brighter "Cyber" branding text, the app icon next to the version label in the tray menu, and a subtler About logo glow.
- Press Enter to confirm and apply in the Crop, Resize, Adjust, Print and Confirm dialogs; primary action buttons show a styled Enter key icon and cancel buttons show a subtle Esc hint.
- Crop improvements: the crop can no longer expand beyond the image bounds, dragging corner handles preserves the original aspect ratio, and the crop rectangle cannot be dragged outside the image area.
- The "Create a copy" toggle moves to the footer, left-aligned next to the action buttons in Resize and Adjust.
- README updates and a PayPal link fix.

### 🇪🇸 Español

- Icono de la app actualizado con un aspecto nuevo en la barra de título, la bandeja y el Acerca de, texto de marca "Cyber" más luminoso, icono de la app junto a la etiqueta de versión en el menú de la bandeja y brillo del logo del Acerca de más sutil.
- Pulsa Enter para confirmar y aplicar en los diálogos Recortar, Cambiar tamaño, Modificar, Imprimir y Confirmar; los botones de acción principales muestran un icono de tecla Enter estilizado y los de cancelar muestran una pista sutil de Esc.
- Mejoras de recorte: el recorte ya no puede expandirse más allá de los límites de la imagen, arrastrar los tiradores de las esquinas conserva la proporción original y el rectángulo de recorte no se puede arrastrar fuera del área de imagen.
- El toggle "Crear una copia" se mueve al pie, alineado a la izquierda junto a los botones de acción en Cambiar tamaño y Modificar.
- Actualizaciones del README y corrección del enlace de PayPal.

## [1.12.1] - 2026-08-22

### 🇺🇸 English

- Installing an update from About no longer opens the NSIS Next/Next wizard: the Setup runs silently and CyberViewer relaunches when it finishes.
- The first-time installer still shows the full UI with the install folder and default-viewer option; the v1.12.0 to v1.12.1 jump may show the wizard one last time, and later updates are silent.

### 🇪🇸 Español

- Instalar una actualización desde Acerca de ya no abre el asistente NSIS de siguiente/siguiente: el Setup se ejecuta en silencio y CyberViewer se reinicia al terminar.
- El instalador de primera vez sigue mostrando la interfaz completa con la carpeta de instalación y la opción de visor predeterminado; el salto de v1.12.0 a v1.12.1 puede mostrar el asistente una última vez, y las actualizaciones posteriores son silenciosas.

## [1.12.0] - 2026-08-22

### 🇺🇸 English

- Settings backup: export and import preferences and favorites as JSON from System settings; recent files and folders stay unchanged.
- Tray toggle hotkey with Alt+Shift+V as the default global shortcut, shown next to Show/Hide in the tray menu.
- Smoother folder browsing: folder thumbnail scanning pauses briefly while you move between images, so navigation stays responsive.
- Burger and context submenus fade and slide in instead of popping open, and the refined official app icon lands in the window, tray, installer and About dialog, with a slightly larger About logo and a clearer cyan glow.
- With Close to Tray enabled the window action reads Close, otherwise Exit; the radar tooltip clarifies that the scan creates the sidebar folder thumbnails, and the title-bar logo glow is removed so it does not compete with the rest of the chrome.

### 🇪🇸 Español

- Respaldo de ajustes: exporta e importa preferencias y favoritos como JSON desde los ajustes del Sistema; los archivos y carpetas recientes quedan sin cambios.
- Hotkey de mostrar u ocultar la bandeja con Alt+Shift+V como atajo global por defecto, mostrado junto a Mostrar/Ocultar en el menú de la bandeja.
- Navegación de carpetas más fluida: el escaneo de miniaturas de la carpeta se pausa brevemente al moverte entre imágenes, para que la navegación siga respondiendo.
- Los submenús del menú hamburguesa y contextuales aparecen con desvanecido y deslizamiento en lugar de abrirse de golpe, y el icono oficial refinado de la app llega a la ventana, la bandeja, el instalador y el Acerca de, con un logo del Acerca de un poco más grande y un brillo cian más claro.
- Con Cerrar a la bandeja activado la acción de la ventana es Cerrar y, si no, Salir; el tooltip del radar aclara que el escaneo crea las miniaturas de carpetas de la barra lateral, y el brillo del logo de la barra de título desaparece para no competir con el resto del chrome.

## [1.11.1] - 2026-08-17

### 🇺🇸 English

- Image printing and PDF export.
- Factory reset setting, with fixes for saving pasted images.
- Redesigned sidebar handle as a minimalist circular indicator, with a dynamic image counter tooltip and vertical drag-to-scroll with momentum.
- Background thumbnail scanning pauses while you zoom or drag on the canvas, the radar icon blinks with a glow while scanning, and already-loaded thumbnails appear immediately to avoid gaps in the sidebar.
- The grid option becomes a neutral checkerboard background with cleaner colors and a smaller pattern.
- Paste workflow polish: pasted images open without intermediate Crop/Resize dialogs, modal Save buttons are relabeled Apply and dimmed when there are no pending changes, and the Modify tool gets its own name and save flow.
- Action bar refinements: fullscreen/slideshow separator, Properties button at the far right, Crop and Resize icons, zoom slider tint, active states for the 1:1 and Fit buttons and a navigation zoom mode setting.
- Open About from the tray menu header, an option to close the image to the tray, menus that close instantly on pointer-down with a close delay for submenus, and centered About modal content.
- Fixed GIF thumbnail previews, non-functional resize modal chips, clipped size tooltips, sidebar navigation labels and favorites tooltip clipping.

### 🇪🇸 Español

- Impresión de imágenes y exportación a PDF.
- Ajuste de restablecimiento de fábrica, con correcciones para guardar imágenes pegadas.
- Asa de la barra lateral rediseñada como indicador circular minimalista, con tooltip dinámico de contador de imágenes y arrastre vertical con inercia.
- El escaneo de miniaturas en segundo plano se pausa al hacer zoom o arrastrar en el lienzo, el icono del radar parpadea con brillo durante el escaneo y las miniaturas ya cargadas aparecen de inmediato para evitar huecos en la barra lateral.
- La opción de rejilla se convierte en un fondo cuadriculado neutro con colores más limpios y un patrón más pequeño.
- Flujo de pegado pulido: las imágenes pegadas se abren sin diálogos intermedios de Recortar/Cambiar tamaño, los botones Guardar de los modales pasan a Aplicar y se atenúan cuando no hay cambios pendientes, y la herramienta Modificar estrena nombre y flujo de guardado.
- Refinamientos de la barra de acciones: separador de pantalla completa/presentación, botón Propiedades al extremo derecho, iconos de Recortar y Cambiar tamaño, tinte del slider de zoom, estados activos para los botones 1:1 y Ajustar y un ajuste de modo de zoom de navegación.
- Abrir Acerca de desde el encabezado del menú de la bandeja, una opción para cerrar la imagen a la bandeja, menús que se cierran al instante al pulsar con un retardo de cierre para submenús y contenido del Acerca de centrado.
- Corregidas las vistas previas de miniaturas GIF, los chips no funcionales del modal de cambio de tamaño, los tooltips de tamaño recortados, las etiquetas de navegación de la barra lateral y el tooltip de favoritos recortado.

## [1.11.0] - 2026-08-10

### 🇺🇸 English

- Dedicated Slideshow menu with a specialized context menu for presentation mode.
- Double-click customization: configure what double-clicking does on an image or the empty canvas (toggle zoom, fullscreen, fit-to-screen or none) from the Settings panel, and double-clicking the empty canvas opens the image selection dialog directly.
- Glyph icon styling inside dropdown menus and modal headers.
- Cleaner context menus: flattened File menu options, redundant Edit options removed from the canvas context menu, and options reordered for a more intuitive layout.
- The action bar hides automatically while navigating in fullscreen, "Show in Explorer" is renamed "Open containing folder" for clarity, and footer icons correctly respect the active tint.

### 🇪🇸 Español

- Menú Presentación dedicado con un menú contextual especializado para el modo presentación.
- Personalización del doble clic: configura qué hace el doble clic sobre una imagen o el lienzo vacío (alternar zoom, pantalla completa, ajustar a pantalla o nada) desde el panel de Ajustes, y el doble clic en el lienzo vacío abre directamente el diálogo de selección de imagen.
- Estilo de iconos de glifo dentro de los menús desplegables y los encabezados de modales.
- Menús contextuales más limpios: opciones del menú Archivo aplanadas, opciones de Editar redundantes eliminadas del menú contextual del lienzo y opciones reordenadas con una disposición más intuitiva.
- La barra de acciones se oculta automáticamente al navegar en pantalla completa, "Mostrar en Explorer" pasa a llamarse "Abrir carpeta contenedora" por claridad y los iconos del pie respetan correctamente el tinte activo.

## [1.10.0] - 2026-08-06

### 🇺🇸 English

- Redesigned configuration window as a clean tabbed layout with automatic settings saving.
- New settings to allow multiple app instances or keep a single one, and to toggle the filename banner visibility.
- Styled action bar with a solid dark background to clearly separate it from the image canvas, plus a top divider matching the title bar thickness.
- Dismissible top-bar hints with a close button and a tooltip explaining how to reactivate them from settings, and the filename banner hides automatically while toast notifications are on screen to avoid overlap.
- Rich icons across context menus (image canvas, thumbnail strip and burger menu) with new canvas options: Add to Favorites, Copy File Path and Properties; the Exit option leaves the thumbnail context menu and menu close behaviors are refined on rotation and window focus changes.
- Tray Exit icon aligned with the burger menu shutdown icon, and the custom file associations page of the NSIS installer fully localized in English and Spanish.

### 🇪🇸 Español

- Ventana de configuración rediseñada como una disposición de pestañas limpia con guardado automático de ajustes.
- Nuevos ajustes para permitir varias instancias de la app o mantener una sola, y para mostrar u ocultar el banner del nombre de archivo.
- Barra de acciones con fondo oscuro sólido para separarla claramente del lienzo de imagen, más un divisor superior que iguala el grosor de la barra de título.
- Pistas superiores descartables con botón de cierre y un tooltip que explica cómo reactivarlas desde ajustes, y el banner del nombre de archivo se oculta automáticamente mientras hay notificaciones toast en pantalla para evitar solapamientos.
- Iconos en todos los menús contextuales (lienzo de imagen, tira de miniaturas y menú hamburguesa) con nuevas opciones del lienzo: Añadir a favoritos, Copiar ruta del archivo y Propiedades; la opción Salir deja el menú contextual de miniaturas y los comportamientos de cierre de menús se refinan al rotar o cambiar el foco de la ventana.
- Icono de Salir de la bandeja alineado con el de apagado del menú hamburguesa, y la página de asociaciones de archivos del instalador NSIS totalmente localizada en inglés y español.

## [1.9.0] - 2026-08-03

### 🇺🇸 English

- Custom HTML tray menu replacing the native OS menu, styled consistently with CyberPaste.
- Global Alt+Shift+V shortcut to show or hide CyberViewer instantly.
- Horizontal and vertical flip tools accessible via menus, keyboard shortcuts and UI controls.
- Faster image opening from File Explorer by showing the preview before folder scanning completes, plus parallelized filesystem statistics scanning and optimized menu item positioning and canvas context submenus.
- Window and layout polish: restored window borders become a bottom-only line, redesigned minimize and maximize icons, removed title bar glow, and improved submenu layout that avoids edge clipping.
- New setting to disable UI tooltips globally, with fixes for nested context submenu overlap, spinner shrinking on zoom, duplicate auto-hide toggle configurations and favorite toast clearing.

### 🇪🇸 Español

- Menú de bandeja HTML personalizado que sustituye al menú nativo del sistema, con un estilo coherente con CyberPaste.
- Atajo global Alt+Shift+V para mostrar u ocultar CyberViewer al instante.
- Herramientas de volteo horizontal y vertical accesibles desde menús, atajos de teclado y controles de la interfaz.
- Apertura de imágenes más rápida desde el Explorador de archivos mostrando la vista previa antes de completar el escaneo de la carpeta, además de estadísticas del sistema de archivos paralelizadas y posicionamiento de elementos de menú y submenús contextuales del lienzo optimizado.
- Pulido de ventana y disposición: los bordes restaurados de la ventana pasan a ser una línea inferior, iconos de minimizar y maximizar rediseñados, brillo de la barra de título eliminado y una disposición de submenús mejorada que evita recortes en los bordes.
- Nuevo ajuste para desactivar globalmente los tooltips de la interfaz, con correcciones de solapamiento de submenús contextuales anidados, spinner encogido al hacer zoom, configuraciones duplicadas del toggle de auto-ocultar y limpieza del toast de favoritos.

## [1.8.1] - 2026-07-22

### 🇺🇸 English

- Opening an image takes priority over bulk sidebar thumbnails on large folders: the active thumbnail loads first in a priority queue while the others wait until the main image paints.
- Quieter updates: one toast per version when a new update is available (with check on startup enabled), a soft menu badge while an update is pending, and a ready-to-install toast once the download completes.
- Collapsible action bar from View > Action bar, reopened in place via a slim bottom-edge tab, with tooltips that clear the status bar and a default cursor on the empty dock chrome instead of a fake grab cursor.
- The optional "Set as default image viewer" installer page is restored, checked by default and kept enabled for silent installs.

### 🇪🇸 Español

- Abrir una imagen tiene prioridad sobre las miniaturas masivas de la barra lateral en carpetas grandes: la miniatura activa carga primero en una cola de prioridad mientras las demás esperan a que la imagen principal se pinte.
- Actualizaciones menos insistentes: un toast por versión cuando hay una actualización nueva (con la comprobación al inicio activada), una insignia suave en el menú mientras hay una pendiente y un toast de lista para instalar al completarse la descarga.
- Barra de acciones colapsable desde Ver > Barra de acciones, reabierta en su sitio mediante una pestaña fina en el borde inferior, con tooltips que respetan la barra de estado y un cursor por defecto sobre el chrome vacío del dock en lugar de un falso cursor de agarre.
- La página opcional "Establecer como visor de imágenes predeterminado" del instalador se restaura, marcada por defecto y se mantiene activada en instalaciones silenciosas.

## [1.8.0] - 2026-07-22

### 🇺🇸 English

- New Adjustments modal (Edit menu, toolbar or J shortcut) with live preview on a large right-hand canvas: brightness, contrast, saturation, blur, grayscale and invert, A/B compare (hold to peek the original, short click to latch), preview zoom controls, a create-a-copy option and full-resolution output on save.
- Redesigned Properties inspector with file and image sections and a large preview: dimensions, aspect ratio, megapixels, folder index, favorite state, created and modified timestamps, format and MIME, path with copy, plus Show in Explorer, copy summary and Windows properties actions; it opens from the toolbar info button, Ctrl+I, the menu or the status bar size and weight.
- Slideshow mode with optional loop and interval, and immersive chrome polish with a stable HUD, hidden tool dock and a zoom badge on wheel.
- Open folder and recent folders, with recent images and folders in context menus.
- The installer registers per-user image associations (HKCU).
- Transparency checkerboard for images with alpha, and real OS fullscreen improvements.
- Crop polish: the area outside the selection dims during preview, crop handles keep breathing room from the edges with a softer glow, and "Create a copy" toggles become unified single-line controls across Crop, Resize and Adjust.
- Fixed modal tooltip clipping in Adjust and Resize.

### 🇪🇸 Español

- Nuevo modal de Ajustes (menú Editar, barra de herramientas o atajo J) con vista previa en vivo en un gran lienzo a la derecha: brillo, contraste, saturación, desenfoque, escala de grises e invertir, comparación A/B (mantén pulsado para ver el original, un clic corto para fijar), controles de zoom de la vista previa, opción de crear una copia y salida a resolución completa al guardar.
- Inspector de Propiedades rediseñado con secciones de archivo e imagen y una gran vista previa: dimensiones, proporción, megapíxeles, índice en la carpeta, estado de favorito, fechas de creación y modificación, formato y MIME, ruta con copia, además de acciones Mostrar en Explorer, copiar resumen y Propiedades de Windows; se abre desde el botón de información de la barra de herramientas, Ctrl+I, el menú o el tamaño y peso de la barra de estado.
- Modo presentación con repetición e intervalo opcionales, y chrome inmersivo pulido con HUD estable, dock de herramientas oculto e insignia de zoom al usar la rueda.
- Abrir carpeta y carpetas recientes, con imágenes y carpetas recientes en los menús contextuales.
- El instalador registra asociaciones de imágenes por usuario (HKCU).
- Cuadriculado de transparencia para imágenes con alfa y mejoras de la pantalla completa real del sistema.
- Pulido del recorte: el área fuera de la selección se atenúa durante la vista previa, los tiradores del recorte respiran sin pegarse a los bordes con un brillo más suave, y los toggles "Crear una copia" son controles unificados de una línea en Recortar, Cambiar tamaño y Modificar.
- Corregido el recorte de tooltips en los modales de Modificar y Cambiar tamaño.

## [1.7.2] - 2026-07-21

### 🇺🇸 English

- The thumbnail sidebar starts disabled by default on startup.
- About modal content is centered, with topbar logo colors synchronized with the About modal, brand name colors swapped and the version shown inline.
- Pasting an image from the clipboard clears the folder thumbnail strip and isolates the session.
- The center button hides when the folder has a single thumbnail or fewer, the favorites tooltip no longer clips in restored mode, and the sidebar edge rail keeps its full height across empty and image states.

### 🇪🇸 Español

- La barra lateral de miniaturas inicia desactivada por defecto.
- El contenido del modal Acerca de queda centrado, con los colores del logo de la barra superior sincronizados con el Acerca de, los colores del nombre de marca intercambiados y la versión mostrada inline.
- Pegar una imagen desde el portapapeles limpia la tira de miniaturas de la carpeta y aísla la sesión.
- El botón de centrar se oculta cuando la carpeta tiene una miniatura o menos, el tooltip de favoritos ya no se recorta en modo restaurado y el riel del borde de la barra lateral mantiene su altura completa en los estados vacío y con imagen.

## [1.7.1] - 2026-07-21

### 🇺🇸 English

- Build artifact names use hyphens again for electron-updater compatibility, keeping in-app updates working.

### 🇪🇸 Español

- Los nombres de los artefactos de build vuelven a usar guiones para compatibilidad con electron-updater, manteniendo funcionales las actualizaciones integradas.

## [1.7.0] - 2026-07-21

### 🇺🇸 English

- Redesigned sidebar handle as a full-height rail with a centered pill, quiet idle state, no close flash and hover anchored to the panel height.
- Dual-mode toolbar with more spacing and isolated from the lower chrome, plus a polished empty-state welcome screen.
- Floating save and discard actions anchored to the rotate buttons, with clarified compact top-bar navigation hints.
- Fixed the status bar file size, the fullscreen scrollbar, the window separator and stuck tooltips, and the fit and fullscreen toolbar buttons get compact icons.
- Spanish UI copy polished, including the "escaneo" wording in sidebar tooltips, with renderer i18n and helpers modularized.
- Hardened path allowlist and improved main-process media performance.

### 🇪🇸 Español

- Asa de la barra lateral rediseñada como riel de altura completa con píldora centrada, reposo silencioso, sin destello al cerrar y hover anclado a la altura del panel.
- Barra de herramientas de doble modo con más espaciado y aislada del chrome inferior, además de una pantalla de bienvenida del estado vacío pulida.
- Acciones flotantes de guardar y descartar ancladas a los botones de rotación, con pistas de navegación compactas de la barra superior aclaradas.
- Corregido el tamaño de archivo de la barra de estado, la scrollbar en pantalla completa, el separador de ventana y los tooltips atascados, y los botones de ajustar y pantalla completa de la barra de herramientas estrenan iconos compactos.
- Texto en español de la interfaz pulido, incluida la palabra "escaneo" en los tooltips de la barra lateral, con la i18n y los helpers del renderer modularizados.
- Lista de rutas permitidas reforzada y rendimiento de medios del proceso principal mejorado.

## [1.6.2] - 2026-07-20

### 🇺🇸 English

- Electron 35 runtime upgrade for security and Windows chrome.
- Config panel polish: language option first, live accent preview on Save and clearer labels.
- Tray improvements: dynamic Show/Hide labels, no forced maximize and window bounds persist when hiding.
- Sidebar folder header and a clearer Scan status (formerly Radar).
- Tooltip and window chrome polish across the status bar, burger menu and sidebar handle, plus last-monitor restore when the preferred display is set to Last used.

### 🇪🇸 Español

- Actualización del runtime a Electron 35 por seguridad y chrome de Windows.
- Pulido del panel de configuración: el idioma primero, vista previa del acento en vivo al Guardar y etiquetas más claras.
- Mejoras de la bandeja: etiquetas dinámicas de Mostrar/Ocultar, sin maximizado forzado y límites de ventana que persisten al ocultar.
- Encabezado de carpeta en la barra lateral y un estado de Escaneo más claro (antes Radar).
- Pulido de tooltips y chrome de ventana en la barra de estado, el menú hamburguesa y el asa de la barra lateral, además de restauración en el último monitor cuando la pantalla preferida está en Último usado.

## [1.6.1] - 2026-07-20

### 🇺🇸 English

- In-app updates arrive for NSIS installs via electron-updater, a flow requested by users.
- Fixed the oversized startup window on mixed-DPI multi-monitor setups and image loading on Windows, restoring Orbitron for the digit HUDs.
- The thumbnail sidebar open state persists when toggled.
- Faster sidebar DOM insertion and an optimized image preloading cache, with the interface switching to system fonts.

### 🇪🇸 Español

- Llegan las actualizaciones integradas para instalaciones NSIS vía electron-updater, un flujo pedido por los usuarios.
- Corregida la ventana de inicio sobredimensionada en configuraciones de DPI mixto multi-monitor y la carga de imágenes en Windows, restaurando Orbitron para los HUDs de dígitos.
- El estado abierto de la barra lateral de miniaturas persiste al alternarla.
- Inserción DOM de la barra lateral más rápida y caché de precarga de imágenes optimizada, con la interfaz cambiando a fuentes del sistema.

## [1.6.0] - 2026-06-04

### 🇺🇸 English

- Update checks delegate to the main process, fixing the CORS "Failed to fetch" error, with the repository updated to CyberGems and more detailed update status error messages.
- Burger and context menus close each other instead of stacking, custom right-click menus no longer stretch their width, submenus keep hover when opening, and shortcut keys are more visible in context menus.
- Resize modal: dual sliders for unlocked aspect ratio mode, inputs clamped to 16384px, true scale percentage when dimensions exceed the 400% slider range, and a compact estimated weight result that scales dynamically.
- Resize tooltips no longer overflow or clip, the number spinner hides, labels are localized, and the aspect lock uses custom SVG link icons.
- The portable build output filename includes "Portable".

### 🇪🇸 Español

- La búsqueda de actualizaciones se delega en el proceso principal, arreglando el error CORS "Failed to fetch", con el repositorio actualizado a CyberGems y mensajes de error de estado de actualización más detallados.
- El menú hamburguesa y los contextuales se cierran entre sí en lugar de apilarse, los menús personalizados de clic derecho ya no estiran su ancho, los submenús conservan el hover al abrirse y las teclas de atajo se ven mejor en los menús contextuales.
- Modal de cambio de tamaño: sliders dobles para el modo de proporción desbloqueada, entradas limitadas a 16384px, porcentaje de escala real cuando las dimensiones exceden el rango del slider de 400% y un resultado compacto de peso estimado que escala dinámicamente.
- Los tooltips de cambio de tamaño ya no se desbordan ni se recortan, el spinner numérico se oculta, las etiquetas están localizadas y el bloqueo de proporción usa iconos SVG de enlace personalizados.
- El nombre de archivo del build portable incluye "Portable".

## [1.5.1] - 2026-06-02

### 🇺🇸 English

- Maintenance release collecting accumulated local changes and optimizations, published without dedicated release notes.

### 🇪🇸 Español

- Versión de mantenimiento que recopila cambios y optimizaciones locales acumulados, publicada sin notas de versión dedicadas.

## [1.3.0] - 2026-05-19

### 🇺🇸 English

- Favorites filter view: a stars toggle in the sidebar with dynamic FAVORITOS/TODAS labels, and automatic validation that prunes deleted paths from the favorites list on disk.
- A SHOW button next to OPEN in the HUD to open files directly at their folder location.
- Windows Explorer context menu switch in settings: options register and unregister on demand, localize dynamically as "Ver con CyberViewer" / "Abrir con CyberViewer" (ES) and "View with CyberViewer" / "Open with CyberViewer" (EN), and embed the CyberViewer logo next to the default open association and the custom shell items.
- Around 10x faster registry actions by replacing the heavy PowerShell script with batched native reg.exe commands (under 470ms), with the save action made asynchronous so the UI closes instantly.
- Sharper tray and app icons from a new high-quality 256x256 square icon, fixing tray blurriness and aliasing.
- Centered title bar hotkeys HUD and a canvas fix that stops broken-image placeholder frames and alt text flashes during slow file loads.

### 🇪🇸 Español

- Vista de filtro de favoritos: un toggle de estrellas en la barra lateral con etiquetas dinámicas FAVORITOS/TODAS y validación automática que poda del disco las rutas borradas de la lista de favoritos.
- Botón SHOW junto a OPEN en el HUD para abrir archivos directamente en su carpeta.
- Interruptor del menú contextual de Windows Explorer en ajustes: las opciones se registran y quitan bajo demanda, se localizan dinámicamente como "Ver con CyberViewer" / "Abrir con CyberViewer" (ES) y "View with CyberViewer" / "Open with CyberViewer" (EN) e incrustan el logo de CyberViewer junto a la asociación de apertura por defecto y los elementos shell personalizados.
- Acciones de registro unas 10 veces más rápidas sustituyendo el pesado script de PowerShell por comandos nativos reg.exe por lotes (menos de 470ms), con el guardado asíncrono para que la UI se cierre al instante.
- Iconos de bandeja y app más nítidos gracias a un nuevo icono cuadrado de 256x256 de alta calidad, arreglando el desenfoque y el aliasing de la bandeja.
- HUD de atajos de la barra de título centrado y corrección del lienzo que evita los marcos de imagen rota y los destellos del texto alt durante cargas lentas de archivos.
