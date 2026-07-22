; CyberViewer NSIS customizations (electron-builder include)
; - Optional "Set as default image viewer" page (assisted installer)
; - Per-user HKCU associations when the checkbox is checked (default: on)
;
; Note: electron-builder compiles this script twice (installer + uninstaller with
; BUILD_UNINSTALLER). Install-only pages/functions must be guarded or NSIS
; treats "function not referenced" as a fatal warning.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var CV_DefaultCheckbox
Var CV_SetAsDefault

; Default ON so silent installs and skipped pages still opt into defaults
!macro customInit
  StrCpy $CV_SetAsDefault 1
!macroend

; Shown after directory page, before files are installed (installer pass only)
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom CV_DefaultViewerPage_Show CV_DefaultViewerPage_Leave
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
Function CV_DefaultViewerPage_Show
  ; Avoid MUI_HEADER_TEXT — not always defined in electron-builder include context
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Default image viewer"
  Pop $1

  ${NSD_CreateLabel} 0 22u 100% 48u "CyberViewer can open JPG, JPEG, PNG, GIF, WEBP, BMP and TIFF.$\r$\n$\r$\nCheck the option below to use CyberViewer as your default image viewer for these formats (current user).$\r$\n$\r$\nYou can change defaults later in Windows Settings > Apps > Default apps."
  Pop $2

  ${NSD_CreateCheckbox} 0 78u 100% 14u "Set CyberViewer as the default image viewer"
  Pop $CV_DefaultCheckbox
  ; Default: checked
  ${NSD_Check} $CV_DefaultCheckbox

  ${NSD_CreateLabel} 0 98u 100% 24u "ES: Establecer CyberViewer como visor de imagenes predeterminado"
  Pop $3

  nsDialogs::Show
FunctionEnd

Function CV_DefaultViewerPage_Leave
  ${NSD_GetState} $CV_DefaultCheckbox $CV_SetAsDefault
FunctionEnd
!endif

; Write a single ProgID + extension default under HKCU (current user)
!macro CV_WriteImageAssoc EXT PROGID DESC
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open" "" "Open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${EXT}" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro customInstall
  ; When the user opts in (or silent default), set per-user defaults under HKCU
  ; NSD_GetState: 1 = checked, 0 = unchecked
  ${If} $CV_SetAsDefault == 1
    !insertmacro CV_WriteImageAssoc ".jpg"  "CyberViewer.jpg"  "JPEG Image"
    !insertmacro CV_WriteImageAssoc ".jpeg" "CyberViewer.jpg"  "JPEG Image"
    !insertmacro CV_WriteImageAssoc ".png"  "CyberViewer.png"  "PNG Image"
    !insertmacro CV_WriteImageAssoc ".gif"  "CyberViewer.gif"  "GIF Image"
    !insertmacro CV_WriteImageAssoc ".webp" "CyberViewer.webp" "WebP Image"
    !insertmacro CV_WriteImageAssoc ".bmp"  "CyberViewer.bmp"  "BMP Image"
    !insertmacro CV_WriteImageAssoc ".tif"  "CyberViewer.tiff" "TIFF Image"
    !insertmacro CV_WriteImageAssoc ".tiff" "CyberViewer.tiff" "TIFF Image"

    WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationName" "CyberViewer"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationDescription" "CyberViewer image viewer"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpg" "CyberViewer.jpg"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpeg" "CyberViewer.jpg"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".png" "CyberViewer.png"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".gif" "CyberViewer.gif"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".webp" "CyberViewer.webp"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".bmp" "CyberViewer.bmp"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tif" "CyberViewer.tiff"
    WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tiff" "CyberViewer.tiff"
    WriteRegStr HKCU "Software\RegisteredApplications" "CyberViewer" "Software\CyberViewer\Capabilities"

    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\CyberViewer.jpg"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.png"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.gif"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.webp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.bmp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.tiff"
  DeleteRegKey HKCU "Software\CyberViewer"
  DeleteRegValue HKCU "Software\RegisteredApplications" "CyberViewer"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
