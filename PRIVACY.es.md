# Privacidad — CyberViewer

CyberViewer funciona en tu PC y guarda tus datos en tu PC. **No tiene cuenta, telemetría, SDK de analítica ni anuncios.** Nunca envía tu datos de sesión, imágenes o ajustes a su autor ni a nadie más.

Todo lo que sabe (datos de sesión, imágenes o ajustes) se queda en `%APPDATA%\CyberViewer\` (ajustes, imágenes de sesión, copias, caché de miniaturas y logs). El instalador personalizado limpia las asociaciones de archivos; el borrado de datos no está configurado en los scripts del repo.

## Cuándo CyberViewer se conecta a internet

Estas son todas las conexiones que CyberViewer hace por su cuenta. Ninguna envía tu datos de sesión, imágenes o ajustes. Como en cualquier petición de internet, el servidor ve tu dirección IP.

| Cuándo | Dónde | Para qué | Cómo desactivarlo |
|---|---|---|---|
| 8 segundos después de iniciar | GitHub Releases, con notas desde `api.github.com` | Consultar una versión nueva | `checkUpdatesOnStartup` en Configuración |

La reproducción de YouTube carga `www.youtube.com` y los hosts de vídeo de Google solo cuando inicias un vídeo.

## Qué lee CyberViewer de tu PC

CyberViewer lee solo los archivos que abres y los datos locales de sesión. Esa información se queda en pantalla. Todo lo que cambia el sistema pide confirmación antes y, cuando es posible, guarda una copia para poder deshacerlo.

## Dudas

Abre un issue: https://github.com/CyberGems/CyberViewer/issues

Para una pregunta concreta sobre privacidad, usa la [página de contacto](https://cybergems.org/contact). La declaración general de la suite está en [cybergems.org/es/privacy](https://cybergems.org/es/privacy).
