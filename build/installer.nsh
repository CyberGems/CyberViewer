; CyberViewer NSIS customizations (electron-builder include)
; - Independent image, video and audio default-app options (checked by default)
; - Per-user HKCU associations when the option is enabled
; - Cleanup on uninstall
;
; electron-builder compiles this script twice (installer + uninstaller with
; BUILD_UNINSTALLER) and treats NSIS warnings as errors. Rules of thumb:
; - No unused `Var` (use register variables for the checkbox page instead)
; - Guard install-only Page/Functions with !ifndef BUILD_UNINSTALLER
; - Avoid MUI_HEADER_TEXT (not always defined in this include context)

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; LangStrings for custom page localization
LangString CV_DefaultViewerTitle 1033 "Default apps"
LangString CV_DefaultViewerTitle 3082 "Aplicaciones predeterminadas"

LangString CV_DefaultViewerBody 1033 "Choose which file groups CyberViewer should open by default.$\r$\n$\r$\nAudio: MP3, WAV, FLAC, OGG, OGA, OPUS, AAC, M4A.$\r$\n$\r$\nYou can change these choices later in Windows Settings > Apps > Default apps."
LangString CV_DefaultViewerBody 3082 "Elige los grupos de archivos que CyberViewer abrirá de forma predeterminada.$\r$\n$\r$\nAudio: MP3, WAV, FLAC, OGG, OGA, OPUS, AAC, M4A.$\r$\n$\r$\nPuedes cambiar estas opciones después en Configuración de Windows > Aplicaciones > Aplicaciones predeterminadas."

LangString CV_DefaultViewerCheckbox 1033 "Set CyberViewer as the default image viewer"
LangString CV_DefaultViewerCheckbox 3082 "Establecer CyberViewer como el visor de imágenes predeterminado"

LangString CV_VideoViewerCheckbox 1033 "Set CyberViewer as the default video player"
LangString CV_VideoViewerCheckbox 3082 "Establecer CyberViewer como el reproductor de video predeterminado"

LangString CV_AudioViewerCheckbox 1033 "Set CyberViewer as the default audio player"
LangString CV_AudioViewerCheckbox 3082 "Establecer CyberViewer como el reproductor de audio predeterminado"

; $R9 = image flag, $R7 = video flag, $R6 = audio flag (1 = yes, 0 = no).
; All three default ON for silent installs.
!macro customInit
  StrCpy $R9 1
  StrCpy $R7 1
  StrCpy $R6 1
!macroend

; Shown after directory page, before files are installed (installer pass only)
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom CV_DefaultViewerPage_Show CV_DefaultViewerPage_Leave
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
Function CV_DefaultViewerPage_Show
  ; In-app updates run the Setup with /S. Custom pages can still appear
  ; unless we abort when silent — keep the wizard for manual installs only.
  IfSilent 0 +2
  Abort

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 18u "$(CV_DefaultViewerTitle)"
  Pop $1

  ${NSD_CreateLabel} 0 20u 100% 50u "$(CV_DefaultViewerBody)"
  Pop $2

  ${NSD_CreateCheckbox} 0 78u 100% 14u "$(CV_DefaultViewerCheckbox)"
  Pop $R8
  ${NSD_Check} $R8

  ${NSD_CreateCheckbox} 0 96u 100% 14u "$(CV_VideoViewerCheckbox)"
  Pop $R7
  ${NSD_Check} $R7

  ${NSD_CreateCheckbox} 0 114u 100% 14u "$(CV_AudioViewerCheckbox)"
  Pop $R6
  ${NSD_Check} $R6

  nsDialogs::Show
FunctionEnd

Function CV_DefaultViewerPage_Leave
  ; 1 = checked, 0 = unchecked ($R9 images, $R7 videos, $R6 audio)
  ${NSD_GetState} $R8 $R9
  ${NSD_GetState} $R7 $R7
  ${NSD_GetState} $R6 $R6
FunctionEnd
!endif

; Write a single ProgID + extension default under HKCU (current user)
!macro CV_WriteFileAssoc EXT PROGID DESC
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open" "" "Open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${EXT}" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro customInstall
  ; electron-builder 24 writes neither the Add/Remove Programs URL values
  ; nor Comments. APP_DESCRIPTION comes from description in package.json;
  ; UNINSTALL_APP_KEY is a command-line define, available in this header.
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "URLInfoAbout" "https://cybergems.org"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "URLUpdateInfo" "https://cybergems.org"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "HelpLink" "https://cybergems.org"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "Comments" "${APP_DESCRIPTION}"
  ; Only when user left the image checkbox checked (or silent install default)
  ${If} $R9 == 1
    !insertmacro CV_WriteFileAssoc ".jpg"  "CyberViewer.jpg"  "JPEG Image"
    !insertmacro CV_WriteFileAssoc ".jpeg" "CyberViewer.jpg"  "JPEG Image"
    !insertmacro CV_WriteFileAssoc ".png"  "CyberViewer.png"  "PNG Image"
    !insertmacro CV_WriteFileAssoc ".gif"  "CyberViewer.gif"  "GIF Image"
    !insertmacro CV_WriteFileAssoc ".webp" "CyberViewer.webp" "WebP Image"
    !insertmacro CV_WriteFileAssoc ".bmp"  "CyberViewer.bmp"  "BMP Image"
    !insertmacro CV_WriteFileAssoc ".tif"  "CyberViewer.tiff" "TIFF Image"
    !insertmacro CV_WriteFileAssoc ".tiff" "CyberViewer.tiff" "TIFF Image"
    !insertmacro CV_WriteFileAssoc ".ico"  "CyberViewer.ico"  "Icon Image"
    !insertmacro CV_WriteFileAssoc ".avif" "CyberViewer.avif" "AVIF Image"
  ${EndIf}

  ; Only when user left the video checkbox checked (or silent install default)
  ${If} $R7 == 1
    !insertmacro CV_WriteFileAssoc ".mp4"  "CyberViewer.video" "Video"
    !insertmacro CV_WriteFileAssoc ".m4v"  "CyberViewer.video" "Video"
    !insertmacro CV_WriteFileAssoc ".webm" "CyberViewer.video" "Video"
    !insertmacro CV_WriteFileAssoc ".mov"  "CyberViewer.video" "Video"
    !insertmacro CV_WriteFileAssoc ".mkv"  "CyberViewer.video" "Video"
  ${EndIf}

  ${If} $R6 == 1
    !insertmacro CV_WriteFileAssoc ".mp3"  "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".wav"  "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".flac" "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".ogg" "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".oga" "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".opus" "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".aac" "CyberViewer.audio" "Audio"
    !insertmacro CV_WriteFileAssoc ".m4a" "CyberViewer.audio" "Audio"
  ${EndIf}

  ${If} $R9 == 1
    ${OrIf} $R7 == 1
    ${OrIf} $R6 == 1
    WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationName" "CyberViewer"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationDescription" "CyberViewer image, video and audio viewer"
  ${EndIf}

  ${If} $R9 == 1
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpg" "CyberViewer.jpg"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpeg" "CyberViewer.jpg"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".png" "CyberViewer.png"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".gif" "CyberViewer.gif"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".webp" "CyberViewer.webp"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".bmp" "CyberViewer.bmp"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tif" "CyberViewer.tiff"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tiff" "CyberViewer.tiff"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".ico" "CyberViewer.ico"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".avif" "CyberViewer.avif"
  ${EndIf}

  ${If} $R7 == 1
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".mp4" "CyberViewer.video"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".m4v" "CyberViewer.video"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".webm" "CyberViewer.video"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".mov" "CyberViewer.video"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".mkv" "CyberViewer.video"
  ${EndIf}

  ${If} $R6 == 1
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".mp3" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".wav" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".flac" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".ogg" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".oga" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".opus" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".aac" "CyberViewer.audio"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".m4a" "CyberViewer.audio"
  ${EndIf}

  ${If} $R9 == 1
    ${OrIf} $R7 == 1
    ${OrIf} $R6 == 1
    WriteRegStr HKCU "Software\RegisteredApplications" "CyberViewer" "Software\CyberViewer\Capabilities"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend

!macro customUnInstall
  ; Best-effort cleanup of per-user defaults we may have written. Our ProgID
  ; keys go away entirely; the extension default values are cleared only when
  ; they still point at us, so third-party choices are never touched.
  DeleteRegKey HKCU "Software\Classes\CyberViewer.jpg"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.png"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.gif"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.webp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.bmp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.tiff"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.ico"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.avif"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.video"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.audio"
  ClearErrors
  ReadRegStr $R8 HKCU "Software\Classes\.jpg" ""
  ${If} $R8 == "CyberViewer.jpg"
    DeleteRegValue HKCU "Software\Classes\.jpg" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.jpeg" ""
  ${If} $R8 == "CyberViewer.jpg"
    DeleteRegValue HKCU "Software\Classes\.jpeg" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.png" ""
  ${If} $R8 == "CyberViewer.png"
    DeleteRegValue HKCU "Software\Classes\.png" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.gif" ""
  ${If} $R8 == "CyberViewer.gif"
    DeleteRegValue HKCU "Software\Classes\.gif" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.webp" ""
  ${If} $R8 == "CyberViewer.webp"
    DeleteRegValue HKCU "Software\Classes\.webp" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.bmp" ""
  ${If} $R8 == "CyberViewer.bmp"
    DeleteRegValue HKCU "Software\Classes\.bmp" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.tif" ""
  ${If} $R8 == "CyberViewer.tiff"
    DeleteRegValue HKCU "Software\Classes\.tif" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.tiff" ""
  ${If} $R8 == "CyberViewer.tiff"
    DeleteRegValue HKCU "Software\Classes\.tiff" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.ico" ""
  ${If} $R8 == "CyberViewer.ico"
    DeleteRegValue HKCU "Software\Classes\.ico" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.avif" ""
  ${If} $R8 == "CyberViewer.avif"
    DeleteRegValue HKCU "Software\Classes\.avif" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.mp4" ""
  ${If} $R8 == "CyberViewer.video"
    DeleteRegValue HKCU "Software\Classes\.mp4" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.m4v" ""
  ${If} $R8 == "CyberViewer.video"
    DeleteRegValue HKCU "Software\Classes\.m4v" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.webm" ""
  ${If} $R8 == "CyberViewer.video"
    DeleteRegValue HKCU "Software\Classes\.webm" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.mov" ""
  ${If} $R8 == "CyberViewer.video"
    DeleteRegValue HKCU "Software\Classes\.mov" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.mkv" ""
  ${If} $R8 == "CyberViewer.video"
    DeleteRegValue HKCU "Software\Classes\.mkv" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.mp3" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.mp3" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.wav" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.wav" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.flac" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.flac" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.ogg" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.ogg" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.oga" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.oga" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.opus" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.opus" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.aac" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.aac" ""
  ${EndIf}
  ReadRegStr $R8 HKCU "Software\Classes\.m4a" ""
  ${If} $R8 == "CyberViewer.audio"
    DeleteRegValue HKCU "Software\Classes\.m4a" ""
  ${EndIf}
  DeleteRegKey HKCU "Software\CyberViewer"
  DeleteRegValue HKCU "Software\RegisteredApplications" "CyberViewer"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
