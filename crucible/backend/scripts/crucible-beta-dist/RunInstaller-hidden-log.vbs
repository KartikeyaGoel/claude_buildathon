' Double-click: runs run-installer-to-log.bat hidden, opens log in Notepad (token + ChatGPT link).
' Keep this file in the same folder as run-installer-to-log.bat and install_claude_desktop_mcp_remote.py

Option Explicit
Dim sh, fso, folder, log

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
log = sh.ExpandEnvironmentStrings("%TEMP%\crucible-mcp-install.log")

sh.Run """" & folder & "\run-installer-to-log.bat""", 0, True
sh.Run "notepad.exe """ & log & """", 1, False
