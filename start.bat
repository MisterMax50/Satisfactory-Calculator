@echo off
rem start.bat — startet den lokalen Server im Ordner dieser Datei und öffnet die App.
cd /d "%~dp0"
start "" http://localhost:8765
python -m http.server 8765
